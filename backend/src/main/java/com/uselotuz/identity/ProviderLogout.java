package com.uselotuz.identity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

/** Spring's LogoutFilter has already invalidated the local session before this handler runs. */
class ProviderLogout implements LogoutSuccessHandler {
    private final FrontendDestinations destinations;
    private final ClientRegistrationRepository registrations;

    ProviderLogout(FrontendDestinations destinations, ClientRegistrationRepository registrations) {
        this.destinations = destinations;
        this.registrations = registrations;
    }

    @Override
    public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        // Preserve Phase 1's API-only logout contract for clients without an application destination.
        if (request.getParameter("app") == null) {
            response.setStatus(204);
            return;
        }
        String destination;
        try {
            destination = destinations.destination(request.getParameter("app"), "/");
        } catch (ResponseStatusException exception) {
            response.sendError(400);
            return;
        }
        String target = destination;
        if (registrations != null && authentication instanceof OAuth2AuthenticationToken oauth
                && oauth.getPrincipal() instanceof OidcUser user) {
            var client = registrations.findByRegistrationId(oauth.getAuthorizedClientRegistrationId());
            if (client != null) {
                String endpoint = (String) client.getProviderDetails().getConfigurationMetadata().get("end_session_endpoint");
                if (endpoint != null) {
                    var logout = UriComponentsBuilder.fromUriString(endpoint)
                            .queryParam("client_id", "{client}")
                            .queryParam("post_logout_redirect_uri", "{destination}");
                    String sid = user.getIdToken().getClaimAsString("sid");
                    if (sid != null && !sid.isBlank()) logout.queryParam("logout_hint", "{sid}");
                    var variables = new java.util.HashMap<String, String>();
                    variables.put("destination", destination);
                    variables.put("client", client.getClientId());
                    if (sid != null && !sid.isBlank()) variables.put("sid", sid);
                    target = logout.encode().buildAndExpand(variables).toUriString();
                }
            }
        }
        // Fetch receives a navigation URL, never an ID/access/refresh token. Navigate at top level for Auth0 logout.
        response.setHeader("Location", target);
        response.setStatus(204);
    }
}
