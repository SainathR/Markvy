use tauri::Url;

/// The only pages the window may show: the bundled app (and the dev server in debug builds).
/// Anything a document tries to navigate to is refused.
pub fn is_app_url(url: &Url) -> bool {
    match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) => true,
        ("http" | "https", Some("tauri.localhost"), None) => true,
        ("http", Some("localhost"), Some(1420)) => cfg!(debug_assertions),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(s: &str) -> bool {
        is_app_url(&s.parse().unwrap())
    }

    #[test]
    fn allows_the_bundled_app_origins() {
        assert!(ok("tauri://localhost/"));
        assert!(ok("tauri://localhost/index.html"));
        assert!(ok("http://tauri.localhost/"));
        assert!(ok("https://tauri.localhost/index.html"));
    }

    #[test]
    fn allows_the_dev_server_in_debug_builds_only() {
        assert_eq!(ok("http://localhost:1420/"), cfg!(debug_assertions));
    }

    #[test]
    fn refuses_everything_else() {
        assert!(!ok("https://evil.example/"));
        assert!(!ok("http://localhost:9999/"));
        assert!(!ok("file:///C:/x"));
        assert!(!ok("https://tauri.localhost.evil.example/"));
    }
}
