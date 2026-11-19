//! Website and email links (spec §4.4, §6): only http, https and mailto leave Markvy, to the default app.
use crate::errors::AppError;

/// Characters that could split a command line or turn a mail address into a file path.
fn unsafe_char(c: char) -> bool {
    c.is_control() || c.is_whitespace() || matches!(c, '/' | '\\' | '"' | '\'' | '<' | '>' | '`')
}

/// A mail link is an address and an optional `?query`. `url` leaves most characters of such an opaque path
/// unencoded, so the address is checked here, both as written and percent-decoded. A fragment means nothing to a
/// mail client and keeps raw `/` and `\`, so it is refused. Only the query keys that fill in a message are allowed
/// (not `attach`, which some mail clients honour for local files).
fn mailto_ok(url: &url::Url) -> bool {
    let address = url.path();
    let decoded = percent_encoding::percent_decode_str(address).decode_utf8_lossy();
    let query = url.query();
    let keys_ok = query.is_none_or(|q| {
        q.split('&').all(|part| {
            part.split_once('=')
                .is_some_and(|(key, _)| ["to", "cc", "bcc", "subject", "body"].contains(&key.to_ascii_lowercase().as_str()))
        })
    });
    address.contains('@')
        && !address.chars().chain(decoded.chars()).any(unsafe_char)
        && !query.unwrap_or("").chars().any(unsafe_char)
        && keys_ok
        && url.fragment().is_none()
}

/// The host must be a real name or an IP address; `..` or `a..b` would be read as part of a file path.
/// Credentials are refused so `https://trusted.com@evil.com/` can't pass for another site.
fn web_host_ok(url: &url::Url) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    match url.host() {
        Some(url::Host::Domain(d)) => d.strip_suffix('.').unwrap_or(d).split('.').all(|label| !label.is_empty()),
        Some(_) => true,
        None => false,
    }
}

pub fn check(url: &str) -> Result<url::Url, AppError> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::LinkRefused)?;
    let ok = match parsed.scheme() {
        "http" | "https" => web_host_ok(&parsed),
        "mailto" => mailto_ok(&parsed),
        _ => false,
    };
    // Belt and braces: `open` treats an argument that names an existing file as a file, not a link.
    if ok && !std::path::Path::new(parsed.as_str()).exists() {
        Ok(parsed)
    } else {
        Err(AppError::LinkRefused)
    }
}

/// Opens the checked address. Mail addresses are vetted for characters that could split the handler's command
/// line; web addresses are percent-encoded by `url`, so each is always one argument.
pub fn open(url: &str) -> Result<(), AppError> {
    let checked = check(url)?;
    ::open::that_detached(checked.as_str()).map_err(|e| AppError::Internal(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_and_email_links_open() {
        for ok in ["https://example.org/a", "http://example.org", "HTTPS://Example.org/Path", "mailto:help@example.org"] {
            assert!(check(ok).is_ok(), "{ok}");
        }
        for bad in ["javascript:alert(1)", "file:///C:/Windows/notepad.exe", "ftp://example.org", "data:text/html,hi", "vbscript:x", "C:\\Windows\\x.exe", "notes.md", ""] {
            assert_eq!(check(bad).unwrap_err(), AppError::LinkRefused, "{bad}");
        }
    }

    #[test]
    fn mail_and_web_links_cannot_name_files_or_split_arguments() {
        for bad in [
            "mailto:x/../../Windows",
            "mailto:x\\..\\Windows",
            "mailto:a@b.c\" /a \"C:\\x",
            "mailto:a@b.c%22%20/a",
            "mailto:",
            "mailto:noat?subject=a@b",
            "https://../Windows",
            "https://a..b/",
            "https://./x",
            "mailto:help@example.org#\\..\\..\\..\\Windows\\System32\\calc",
            "mailto:help@example.org#frag",
            "mailto:a@b.c?attach=C:%5Cx",
            "mailto:a@b.c?Attachment=x",
            "mailto:a@b.c?subject",
            "https://trusted.com@evil.com/",
            "https://user:pw@example.org/",
        ] {
            assert_eq!(check(bad).unwrap_err(), AppError::LinkRefused, "{bad}");
        }
        for ok in ["mailto:help@example.org", "mailto:help@example.org?subject=Hello%20there", "https://192.168.1.10/", "https://[::1]/", "https://example.org./a", "mailto:a@b.c?subject=Hi&body=Line%201%2Fx", "mailto:a@b.c?CC=d@e.f"] {
            assert!(check(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn addresses_are_normalised_before_opening() {
        let url = check("https://example.org/a b\"c").unwrap();
        assert_eq!(url.as_str(), "https://example.org/a%20b%22c");
    }
}
