package com.uselotuz.identity;

import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Only configured applications and local paths can be authentication destinations. */
@Component
class FrontendDestinations {
    private final Map<String, String> origins;

    FrontendDestinations(@Value("${lotuz.frontend-url}") String inventory,
            @Value("${lotuz.workspace-url}") String workspace) {
        origins = Map.of("inventory", origin(inventory), "workspace", origin(workspace));
    }

    static String origin(String value) {
        try {
            URI uri = URI.create(value);
            boolean local = ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || !uri.getRawPath().isEmpty()
                    || !("https".equals(uri.getScheme()) || (local && "http".equals(uri.getScheme())))) {
                throw new IllegalArgumentException();
            }
            return uri.toASCIIString();
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Application origins must be exact HTTPS origins (HTTP only on localhost)");
        }
    }

    List<String> origins() {
        return origins.values().stream().distinct().toList();
    }

    String destination(String app, String path) {
        String origin = origins.get(app == null ? "inventory" : app);
        String target = path == null ? "/" : path;
        try {
            URI uri = URI.create(target);
            if (origin == null || target.length() > 2048 || !target.startsWith("/")
                    || target.startsWith("//") || target.contains("\\") || target.contains("%")
                    || target.chars().anyMatch(c -> Character.isISOControl(c))
                    || uri.isAbsolute() || uri.getRawAuthority() != null || uri.getRawFragment() != null
                    || java.util.Arrays.stream(uri.getPath().split("/")).anyMatch(segment -> segment.equals(".") || segment.equals(".."))
                    || !uri.normalize().equals(uri)) {
                throw new IllegalArgumentException();
            }
            return origin + target;
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid application destination");
        }
    }
}
