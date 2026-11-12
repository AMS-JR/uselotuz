package com.uselotuz.identity;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

@Configuration
@ConditionalOnProperty(name = "lotuz.oidc.enabled", havingValue = "true")
class OidcConfiguration {
    @Bean
    @ConditionalOnMissingBean(ClientRegistrationRepository.class)
    ClientRegistrationRepository registrations(@Value("${lotuz.oidc.issuer:}") String issuer,
            @Value("${lotuz.oidc.client-id:}") String clientId,
            @Value("${lotuz.oidc.client-secret:}") String secret,
            @Value("${lotuz.api-origin}") String apiOrigin) {
        if (issuer.isBlank() || clientId.isBlank() || secret.isBlank()) {
            throw new IllegalStateException("OIDC issuer, client ID and client secret must be configured");
        }
        URI provider = URI.create(issuer);
        if (!"https".equals(provider.getScheme()) || provider.getHost() == null
                || provider.getUserInfo() != null || provider.getRawQuery() != null || provider.getRawFragment() != null) {
            throw new IllegalStateException("OIDC issuer must be an HTTPS issuer URL");
        }
        var client = ClientRegistrations.fromIssuerLocation(issuer)
                .registrationId("lotuz").clientId(clientId).clientSecret(secret)
                .scope("openid", "profile", "email")
                .redirectUri(FrontendDestinations.origin(apiOrigin) + "/login/oauth2/code/lotuz").build();
        Object logoutEndpoint = client.getProviderDetails().getConfigurationMetadata().get("end_session_endpoint");
        if (!(logoutEndpoint instanceof String endpoint) || !URI.create(endpoint).resolve("/").equals(provider.resolve("/"))) {
            throw new IllegalStateException("Enable OIDC logout discovery on the Auth0 tenant; the logout endpoint must use the issuer origin");
        }
        return new InMemoryClientRegistrationRepository(client);
    }
}
