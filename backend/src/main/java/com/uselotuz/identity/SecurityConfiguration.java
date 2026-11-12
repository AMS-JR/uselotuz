package com.uselotuz.identity;

import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.util.UriComponentsBuilder;

@Configuration
public class SecurityConfiguration {
    @Bean
    SecurityFilterChain security(HttpSecurity http, IdentityService identities,
            ObjectProvider<ClientRegistrationRepository> registrations, FrontendDestinations destinations,
            @Value("${lotuz.oidc.enabled:false}") boolean enabled) throws Exception {
        var cors = new CorsConfiguration();
        cors.setAllowedOrigins(destinations.origins());
        cors.setAllowCredentials(true);
        cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
        cors.setExposedHeaders(List.of("Location"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);

        http.cors(c -> c.configurationSource(source))
            .requestCache(c -> c.requestCache(new NullRequestCache()))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/config", "/api/auth/csrf", "/error").permitAll()
                .requestMatchers("/oauth2/**", "/login/**").access((authentication, context) ->
                    new AuthorizationDecision(enabled))
                .anyRequest().access((authentication, context) -> {
                    var auth = authentication.get();
                    return new AuthorizationDecision(enabled && auth.isAuthenticated()
                            && auth.getPrincipal() instanceof OidcUser);
                }))
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req, res, ex) -> res.sendError(401))
                .accessDeniedHandler((req, res, ex) -> res.sendError(403)))
            .logout(l -> l.logoutUrl("/api/auth/logout").deleteCookies("LOTUZ_SESSION")
                .logoutSuccessHandler(new ProviderLogout(destinations, enabled ? registrations.getObject() : null)));

        if (enabled) {
            var navigation = new LoginNavigation(registrations.getObject(), destinations);
            http.oauth2Login(o -> o.clientRegistrationRepository(registrations.getObject())
                .authorizationEndpoint(a -> a.authorizationRequestResolver(navigation)
                    .authorizationRequestRepository(navigation))
                .userInfoEndpoint(u -> u.oidcUserService(request -> {
                    var user = new OidcUserService().loadUser(request);
                    identities.register(user);
                    return user;
                }))
                .successHandler((req, res, authentication) -> {
                    String target = (String) req.getAttribute(LoginNavigation.DESTINATION);
                    res.sendRedirect(target == null ? destinations.destination(null, null) : target);
                })
                .failureHandler((req, res, failure) -> {
                    String target = (String) req.getAttribute(LoginNavigation.DESTINATION);
                    String destination = target == null ? destinations.destination(null, null) : target;
                    res.sendRedirect(UriComponentsBuilder.fromUriString(destination)
                            .queryParam("authError", "login_failed").build().toUriString());
                }));
        }
        return http.build();
    }
}
