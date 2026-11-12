package com.uselotuz.identity;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.web.server.ResponseStatusException;

class LoginNavigationTest {
    private final FrontendDestinations destinations =
            new FrontendDestinations("http://localhost:3001", "http://localhost:3002");

    static ClientRegistration client(String base) {
        return ClientRegistration.withRegistrationId("lotuz")
                .clientId("lotuz-test").clientSecret("test-only").authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://localhost:8080/login/oauth2/code/lotuz").scope("openid", "profile", "email")
                .authorizationUri("https://issuer.example/authorize").tokenUri(base + "/token")
                .jwkSetUri(base + "/jwks").issuerUri("https://issuer.example")
                .providerConfigurationMetadata(Map.of("end_session_endpoint", "https://issuer.example/oidc/logout"))
                .build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example",
            "/%252fevil.example", "/../escape", "/#fragment", "/\r\nLocation:bad"})
    void rejectsExternalAmbiguousAndEncodedDestinations(String path) {
        assertThrows(ResponseStatusException.class, () -> destinations.destination("workspace", path));
    }

    @Test
    void onlyConfiguredApplicationsAndExactOriginsAreAccepted() {
        assertEquals("http://localhost:3002/?businessId=abc", destinations.destination("workspace", "/?businessId=abc"));
        assertThrows(ResponseStatusException.class, () -> destinations.destination("https://evil.example", "/"));
        assertThrows(IllegalArgumentException.class, () -> new FrontendDestinations("https://site.example/path", "http://localhost:3002"));
        assertThrows(IllegalArgumentException.class, () -> new FrontendDestinations("http://production.example", "http://localhost:3002"));
    }

    @Test
    void navigationIsSessionAndStateBoundAndConsumedOnce() {
        var navigation = new LoginNavigation(new InMemoryClientRegistrationRepository(client("http://localhost")), destinations);
        var start = new MockHttpServletRequest("GET", "/oauth2/authorization/lotuz");
        start.setServletPath("/oauth2/authorization/lotuz");
        start.addParameter("app", "workspace");
        start.addParameter("returnTo", "/?businessId=abc");
        start.addParameter("screen_hint", "signup");
        var authorization = navigation.resolve(start);
        assertEquals("signup", authorization.getAdditionalParameters().get("screen_hint"));
        navigation.saveAuthorizationRequest(authorization, start, new MockHttpServletResponse());

        var forged = new MockHttpServletRequest();
        forged.setSession((MockHttpSession) start.getSession());
        forged.addParameter("state", "wrong-state");
        assertNull(navigation.removeAuthorizationRequest(forged, new MockHttpServletResponse()));
        assertNull(forged.getAttribute(LoginNavigation.DESTINATION));

        var callback = new MockHttpServletRequest();
        callback.setSession((MockHttpSession) start.getSession());
        callback.addParameter("state", authorization.getState());
        callback.addParameter("app", "https://evil.example");
        callback.addParameter("returnTo", "//evil.example");
        assertNotNull(navigation.removeAuthorizationRequest(callback, new MockHttpServletResponse()));
        assertEquals("http://localhost:3002/?businessId=abc", callback.getAttribute(LoginNavigation.DESTINATION));
        assertNull(navigation.removeAuthorizationRequest(callback, new MockHttpServletResponse()));

        var otherBrowser = new MockHttpServletRequest();
        otherBrowser.addParameter("state", authorization.getState());
        assertNull(navigation.loadAuthorizationRequest(otherBrowser));
    }
}
