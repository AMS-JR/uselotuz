package com.uselotuz.identity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

/** Navigation is stored with Spring's state-validated request, never taken from callback parameters. */
class LoginNavigation implements OAuth2AuthorizationRequestResolver,
        AuthorizationRequestRepository<OAuth2AuthorizationRequest> {
    static final String DESTINATION = LoginNavigation.class.getName() + ".destination";
    private final DefaultOAuth2AuthorizationRequestResolver resolver;
    private final HttpSessionOAuth2AuthorizationRequestRepository requests =
            new HttpSessionOAuth2AuthorizationRequestRepository();
    private final FrontendDestinations destinations;

    LoginNavigation(ClientRegistrationRepository registrations, FrontendDestinations destinations) {
        resolver = new DefaultOAuth2AuthorizationRequestResolver(registrations, "/oauth2/authorization");
        resolver.setAuthorizationRequestCustomizer(org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers.withPkce());
        this.destinations = destinations;
    }

    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
        return customize(resolver.resolve(request), request);
    }

    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String registrationId) {
        return customize(resolver.resolve(request, registrationId), request);
    }

    private OAuth2AuthorizationRequest customize(OAuth2AuthorizationRequest authorization, HttpServletRequest request) {
        if (authorization == null) return null;
        String destination = destinations.destination(request.getParameter("app"), request.getParameter("returnTo"));
        return OAuth2AuthorizationRequest.from(authorization)
                .attributes(attributes -> attributes.put(DESTINATION, destination))
                .additionalParameters(parameters -> {
                    if ("signup".equals(request.getParameter("screen_hint"))) parameters.put("screen_hint", "signup");
                }).build();
    }

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        return requests.loadAuthorizationRequest(request);
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorization,
            HttpServletRequest request, HttpServletResponse response) {
        requests.saveAuthorizationRequest(authorization, request, response);
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request, HttpServletResponse response) {
        OAuth2AuthorizationRequest authorization = requests.removeAuthorizationRequest(request, response);
        if (authorization != null) request.setAttribute(DESTINATION, authorization.getAttribute(DESTINATION));
        return authorization;
    }
}
