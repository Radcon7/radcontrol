use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::o2::opener_registry_json;

const MAX_URL_BYTES: usize = 4096;
const PROVIDER_HOSTS: &[&str] = &[
    "admin.google.com",
    "chatgpt.com",
    "dash.cloudflare.com",
    "github.com",
    "hub.docker.com",
    "resend.com",
    "supabase.com",
    "vercel.com",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryProject {
    port: Option<u16>,
    url: Option<String>,
    runtime_url: Option<String>,
    launch_url: Option<String>,
    operator_url: Option<String>,
    website_url: Option<String>,
}

impl RegistryProject {
    fn declared_urls(&self) -> impl Iterator<Item = &str> {
        [
            self.url.as_deref(),
            self.runtime_url.as_deref(),
            self.launch_url.as_deref(),
            self.operator_url.as_deref(),
            self.website_url.as_deref(),
        ]
        .into_iter()
        .flatten()
    }
}

fn denied(message: &str) -> Result<Url, String> {
    Err(format!("URL_DENIED: {message}"))
}

fn clean_url(raw: &str) -> Result<Url, String> {
    if raw.is_empty()
        || raw.len() > MAX_URL_BYTES
        || raw != raw.trim()
        || raw.chars().any(char::is_whitespace)
    {
        return denied("the destination is malformed");
    }
    let parsed =
        Url::parse(raw).map_err(|_| "URL_DENIED: the destination is malformed".to_string())?;
    if !parsed.username().is_empty() || parsed.password().is_some() || parsed.host_str().is_none() {
        return denied("userinfo and hostless destinations are forbidden");
    }
    Ok(parsed)
}

fn registered_urls(registry_json: &str) -> Result<Vec<RegistryProject>, String> {
    let value: serde_json::Value = serde_json::from_str(registry_json)
        .map_err(|_| "URL_DENIED: the governed project registry is malformed".to_string())?;
    if !value.is_array() {
        return Err("URL_DENIED: the governed project registry is malformed".to_string());
    }
    serde_json::from_value(value)
        .map_err(|_| "URL_DENIED: the governed project registry is malformed".to_string())
}

pub(crate) fn validate_governed_url(raw: &str, registry_json: &str) -> Result<Url, String> {
    let parsed = clean_url(raw)?;
    let projects = registered_urls(registry_json)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL_DENIED: the destination has no host".to_string())?;

    if parsed.scheme() == "http" {
        if !(raw.starts_with("http://localhost:") || raw.starts_with("http://127.0.0.1:"))
            || !matches!(host, "localhost" | "127.0.0.1")
        {
            return denied("only canonical governed loopback routes may use HTTP");
        }
        let Some(port) = parsed.port() else {
            return denied("a governed loopback route requires an explicit port");
        };
        if projects.iter().any(|project| project.port == Some(port)) {
            return Ok(parsed);
        }
        return denied("the loopback port is not governed by the project registry");
    }

    if parsed.scheme() != "https" || parsed.port_or_known_default() != Some(443) {
        return denied("only HTTPS provider or registered-project destinations are allowed");
    }
    if PROVIDER_HOSTS.contains(&host) {
        return Ok(parsed);
    }

    let declared = projects.iter().flat_map(RegistryProject::declared_urls);
    for candidate in declared {
        let Ok(candidate_url) = clean_url(candidate) else {
            continue;
        };
        if candidate_url.scheme() == "https" && candidate_url == parsed {
            return Ok(parsed);
        }
    }
    denied("the HTTPS host is neither an approved provider nor an exact registered project URL")
}

#[tauri::command]
pub fn open_governed_url(app: AppHandle, url: String) -> Result<String, String> {
    let registry = opener_registry_json()
        .map_err(|_| "URL_OPEN_FAILED: governed registry unavailable".to_string())?;
    let approved = validate_governed_url(&url, &registry)?;
    app.opener()
        .open_url(approved.as_str(), None::<&str>)
        .map_err(|_| {
            "URL_OPEN_FAILED: the operating system rejected the approved destination".to_string()
        })?;
    Ok(approved.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_governed_url;

    const REGISTRY: &str = r#"[
      {"key":"alpha","port":3100,"url":"http://localhost:3100","websiteUrl":"https://alpha.example.test"},
      {"key":"portal","port":3000,"operatorUrl":"http://127.0.0.1:3000/portal"}
    ]"#;

    #[test]
    fn approved_provider_and_governed_destinations_pass() {
        for url in [
            "https://github.com/Radcon7/radcontrol",
            "https://dash.cloudflare.com/example",
            "http://localhost:3100/project/path?nonce=fixture",
            "http://127.0.0.1:3000/portal/child",
            "https://alpha.example.test/",
        ] {
            assert!(
                validate_governed_url(url, REGISTRY).is_ok(),
                "expected allowed: {url}"
            );
        }
    }

    #[test]
    fn hostile_or_unregistered_destinations_fail_explicitly() {
        for url in [
            "https://example.test",
            "https://github.com.attacker.test",
            "https://user:password@github.com/Radcon7",
            "https://%67ithub.com.attacker.test",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "http://localhost:6553/unregistered",
            "http://127.1:3100/alternate-loopback",
            "http://2130706433:3100/numeric-loopback",
            "http://[::1]:3100/ipv6-loopback",
            "not a url",
        ] {
            let error = validate_governed_url(url, REGISTRY).expect_err("hostile URL must fail");
            assert!(
                error.starts_with("URL_DENIED:"),
                "unexpected failure for {url}: {error}"
            );
        }
    }

    #[test]
    fn malformed_registry_fails_closed() {
        assert!(validate_governed_url("https://github.com", "{}").is_err());
        assert!(validate_governed_url("http://localhost:3100", "not-json").is_err());
    }
}
