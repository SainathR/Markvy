//! The only network code in Markvy (spec §3.1, §6): fetching one picture the reader approved.
use crate::errors::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    io::Read,
    time::{Duration, Instant},
};

pub const MAX_BYTES: u64 = 5 * 1024 * 1024;
pub const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, PartialEq, Serialize)]
pub struct RemoteImage {
    pub mime: String,
    pub base64: String,
}

/// http and https only, and no `user:pass@` part (ureq would send it as a Basic Authorization header).
pub fn check_url(url: &str) -> Result<url::Url, AppError> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::ImageRejected)?;
    if !matches!(parsed.scheme(), "http" | "https") || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::ImageRejected);
    }
    Ok(parsed)
}

/// `image/` followed by a non-empty subtype of letters, digits, `.`, `+` and `-` (already lower-case).
fn is_image_type(mime: &str) -> bool {
    mime.strip_prefix("image/")
        .is_some_and(|sub| !sub.is_empty() && sub.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'+' | b'-')))
}

const MAX_REDIRECTS: u32 = 5;

/// One request, no automatic redirects (we follow them ourselves, see `fetch_image_with`).
/// An agent for an https picture refuses plain-http targets, so a redirect can't downgrade it.
/// The timeout bounds connect and the request.
/// ponytail: ureq doesn't bound DNS lookups, so a stalled resolver can outlast the timeout; use a resolver thread if that bites.
fn agent_for(url: &url::Url, timeout: Duration) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(timeout)
        .timeout_connect(timeout)
        .https_only(url.scheme() == "https")
        .redirects(0)
        .build()
}

pub fn fetch_image(url: &str) -> Result<RemoteImage, AppError> {
    fetch_image_with(url, TIMEOUT)
}

/// One anonymous GET: ureq is built without its cookie store, and `check_url` refuses embedded credentials.
/// Redirects are followed here, not by ureq, because ureq 2.12 panics on a redirect target without a host
/// (`Location: file:///...`). Every hop goes through `check_url`, and the whole chain shares one time budget.
pub fn fetch_image_with(url: &str, timeout: Duration) -> Result<RemoteImage, AppError> {
    let first = check_url(url)?;
    let started = Instant::now();
    let mut current = first.clone();
    let mut hops = 0;
    let response = loop {
        let left = timeout.checked_sub(started.elapsed()).filter(|d| !d.is_zero()).ok_or(AppError::ImageFailed)?;
        let response = agent_for(&first, left).get(current.as_str()).call().map_err(|_| AppError::ImageFailed)?;
        if !(300..400).contains(&response.status()) {
            break response;
        }
        hops += 1;
        let next = response.header("Location").and_then(|l| current.join(l).ok());
        if hops > MAX_REDIRECTS || next.is_none() {
            return Err(AppError::ImageFailed);
        }
        current = check_url(next.unwrap().as_str()).map_err(|_| AppError::ImageFailed)?;
    };
    let mime = response.content_type().to_ascii_lowercase();
    if !is_image_type(&mime) {
        return Err(AppError::ImageRejected);
    }
    let declared = response.header("Content-Length").and_then(|v| v.trim().parse::<u64>().ok());
    if declared.is_some_and(|n| n > MAX_BYTES) {
        return Err(AppError::ImageRejected);
    }
    let mut bytes = Vec::new();
    response.into_reader().take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|_| AppError::ImageFailed)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(AppError::ImageRejected);
    }
    Ok(RemoteImage { mime, base64: STANDARD.encode(bytes) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
        time::Instant,
    };

    /// A tiny local server: answers each connection with the next canned response and records each request.
    fn serve(responses: Vec<Vec<u8>>) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}/", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        thread::spawn(move || {
            for body in responses {
                let Ok((mut stream, _)) = listener.accept() else { return };
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                log.lock().unwrap().push(String::from_utf8_lossy(&buf[..n]).to_lowercase());
                let _ = stream.write_all(&body);
            }
        });
        (base, seen)
    }

    fn http(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
        let mut out = format!("HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n", body.len()).into_bytes();
        out.extend_from_slice(body);
        out
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfake";

    #[test]
    fn fetches_a_picture_and_encodes_it() {
        let (base, _) = serve(vec![http("200 OK", "Content-Type: image/png\r\n", PNG)]);
        let img = fetch_image(&format!("{base}a.png")).unwrap();
        assert_eq!(img.mime, "image/png");
        assert_eq!(STANDARD.decode(img.base64).unwrap(), PNG);
    }

    #[test]
    fn refuses_a_page_that_is_not_a_picture() {
        let (base, _) = serve(vec![http("200 OK", "Content-Type: text/html\r\n", b"<html></html>")]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn refuses_more_than_5_mb_by_its_length() {
        let head = format!("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", MAX_BYTES + 1);
        let (base, _) = serve(vec![head.into_bytes()]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn refuses_more_than_5_mb_without_a_length() {
        let mut body = b"HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nConnection: close\r\n\r\n".to_vec();
        body.extend(std::iter::repeat(0u8).take(MAX_BYTES as usize + 1));
        let (base, _) = serve(vec![body]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn a_server_error_is_a_failed_picture() {
        let (base, _) = serve(vec![http("404 Not Found", "Content-Type: text/plain\r\n", b"gone")]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageFailed);
    }

    #[test]
    fn a_slow_server_times_out() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/a.png", listener.local_addr().unwrap());
        let started = Instant::now();
        assert_eq!(fetch_image_with(&url, Duration::from_millis(300)).unwrap_err(), AppError::ImageFailed);
        assert!(started.elapsed() < Duration::from_secs(5));
        drop(listener);
    }

    #[test]
    fn only_web_addresses_are_fetched() {
        for url in ["file:///C:/Windows/win.ini", "ftp://example.org/a.png", "data:image/png;base64,AA==", "javascript:alert(1)", "a.png", "", "http://user:pass@example.org/a.png", "https://user@example.org/a.png", "https://:pw@example.org/a.png"] {
            assert_eq!(fetch_image(url).unwrap_err(), AppError::ImageRejected, "{url}");
        }
    }

    #[test]
    fn only_strict_picture_types_are_accepted() {
        assert!(is_image_type("image/svg+xml") && is_image_type("image/vnd.microsoft.icon") && is_image_type("image/png"));
        for bad in ["image/", "image/png x", "image/pn;g", "image/PNG", "text/html", "", "image"] {
            assert!(!is_image_type(bad), "{bad}");
        }
        // end to end: a content type with junk after the subtype is refused
        let (base, _) = serve(vec![http("200 OK", "Content-Type: image/png x\r\n", PNG)]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn a_redirect_to_a_local_file_fails_and_reads_nothing() {
        let (base, seen) = serve(vec![http("302 Found", "Location: file:///C:/Windows/win.ini\r\n", b"")]);
        let err = fetch_image(&format!("{base}a.png")).unwrap_err();
        assert!(matches!(err, AppError::ImageFailed | AppError::ImageRejected), "{err:?}");
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[test]
    fn too_many_redirects_fail() {
        let (base, seen) = serve((0..8).map(|_| http("302 Found", "Location: /next\r\n", b"")).collect());
        assert_eq!(fetch_image(&format!("{base}a.png")).unwrap_err(), AppError::ImageFailed);
        assert_eq!(seen.lock().unwrap().len(), MAX_REDIRECTS as usize + 1);
    }

    #[test]
    fn an_https_picture_never_follows_a_redirect_to_plain_http() {
        // The agent built for an https URL refuses a plain-http target before connecting; one built for http fetches it.
        let (base, seen) = serve(vec![http("200 OK", "Content-Type: image/png\r\n", PNG)]);
        let https = check_url("https://example.org/a.png").unwrap();
        assert!(agent_for(&https, TIMEOUT).get(&format!("{base}a.png")).call().is_err());
        assert!(seen.lock().unwrap().is_empty());
        let plain = check_url(&base).unwrap();
        assert!(agent_for(&plain, TIMEOUT).get(&format!("{base}a.png")).call().is_ok());
    }

    #[test]
    fn sends_no_cookies() {
        let (base, seen) = serve(vec![
            http("302 Found", "Set-Cookie: track=1\r\nLocation: /b.png\r\n", b""),
            http("200 OK", "Content-Type: image/png\r\n", PNG),
        ]);
        fetch_image(&format!("{base}a.png")).unwrap();
        let requests = seen.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().all(|r| !r.contains("\r\ncookie:")), "{requests:?}");
    }
}
