package com.uselotuz.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

/** Real Spring OAuth filters/token validation against a test-only provider, not proof of a live Auth0 tenant. */
@SpringBootTest(properties = "lotuz.oidc.enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LoginFlowIntegrationTest {
    @Autowired MockMvc mvc;
    @MockitoBean ClientRegistrationRepository registrations;
    private static HttpServer provider;
    private static KeyPair keys;
    private static volatile String nonce;
    private static final AtomicInteger exchanges = new AtomicInteger();

    @BeforeAll static void provider() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        provider.createContext("/jwks", exchange -> {
            var key = (RSAPublicKey) keys.getPublic();
            String jwks = "{\"keys\":[{\"kty\":\"RSA\",\"use\":\"sig\",\"alg\":\"RS256\",\"kid\":\"test-key\",\"n\":\""
                    + unsigned(key.getModulus().toByteArray()) + "\",\"e\":\"" + unsigned(key.getPublicExponent().toByteArray()) + "\"}]}";
            byte[] body = jwks.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        provider.createContext("/token", exchange -> {
            try {
                exchanges.incrementAndGet();
                String body = "{\"access_token\":\"test-access-token\",\"token_type\":\"Bearer\",\"expires_in\":300,\"id_token\":\"" + jwt() + "\"}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            } catch (Exception exception) { throw new java.io.IOException(exception); }
        });
        provider.start();
    }

    @AfterAll static void stopProvider() { if (provider != null) provider.stop(0); }

    @BeforeEach void registration() {
        when(registrations.findByRegistrationId("lotuz")).thenReturn(
                LoginNavigationTest.client("http://127.0.0.1:" + provider.getAddress().getPort()));
    }

    private static String unsigned(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value[0] == 0 ? Arrays.copyOfRange(value, 1, value.length) : value);
    }

    private static String b64(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String jwt() throws Exception {
        long now = Instant.now().getEpochSecond();
        String body = b64("{\"alg\":\"RS256\",\"kid\":\"test-key\"}") + "." +
                b64("{\"iss\":\"https://issuer.example\",\"sub\":\"callback-user\",\"aud\":\"lotuz-test\",\"iat\":"
                + now + ",\"exp\":" + (now + 300) + ",\"nonce\":\"" + nonce
                + "\",\"sid\":\"provider-session-fixture\",\"name\":\"Callback user\"}");
        var signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(keys.getPrivate());
        signer.update(body.getBytes(StandardCharsets.US_ASCII));
        return body + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());
    }

    private MvcResult start(String app) throws Exception {
        return mvc.perform(get("/oauth2/authorization/lotuz").param("app", app)
                .param("returnTo", "/?businessId=example").param("screen_hint", "signup"))
                .andExpect(status().is3xxRedirection()).andReturn();
    }

    private String parameter(MvcResult result, String name) {
        String value = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl()).build().getQueryParams().getFirst(name);
        return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private MockHttpSession authenticate(String app) throws Exception {
        var start = start(app);
        nonce = parameter(start, "nonce");
        var session = (MockHttpSession) start.getRequest().getSession(false);
        mvc.perform(get("/login/oauth2/code/lotuz").session(session)
                .param("code", "test-code").param("state", parameter(start, "state"))
                .param("app", "https://evil.example").param("returnTo", "//evil.example"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("http://localhost:" + (app.equals("workspace") ? "3002" : "3001") + "/?businessId=example"));
        return session;
    }

    @Test void authorizationCodeCreatesSessionAndReturnsToWorkspaceWithoutGrantingAccess() throws Exception {
        var session = authenticate("workspace");
        mvc.perform(get("/api/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Callback user"));
        mvc.perform(get("/api/businesses").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test void directInventoryLoginDoesNotRequireWorkspace() throws Exception {
        var session = authenticate("inventory");
        mvc.perform(get("/api/me").session(session)).andExpect(status().isOk());
    }

    @Test void invalidStateCannotExchangeCodeOrChooseCallbackDestination() throws Exception {
        var start = start("workspace");
        int before = exchanges.get();
        mvc.perform(get("/login/oauth2/code/lotuz").session((MockHttpSession) start.getRequest().getSession())
                .param("code", "test-code").param("state", "forged")
                .param("returnTo", "https://evil.example"))
                .andExpect(redirectedUrl("http://localhost:3001/?authError=login_failed"));
        assertEquals(before, exchanges.get());
    }

    @Test void deniedLoginReturnsGenericFailureToItsOriginalApplication() throws Exception {
        var start = start("workspace");
        assertEquals("signup", parameter(start, "screen_hint"));
        mvc.perform(get("/login/oauth2/code/lotuz").session((MockHttpSession) start.getRequest().getSession())
                .param("error", "access_denied").param("state", parameter(start, "state")))
                .andExpect(redirectedUrl("http://localhost:3002/?businessId=example&authError=login_failed"));
    }

    @Test void logoutInvalidatesSharedSessionAndReturnsTokenFreeProviderNavigation() throws Exception {
        var session = authenticate("workspace");
        var csrf = mvc.perform(get("/api/auth/csrf").session(session)).andReturn();
        String token = com.jayway.jsonpath.JsonPath.read(csrf.getResponse().getContentAsString(), "$.token");
        var response = mvc.perform(post("/api/auth/logout").session(session).param("app", "workspace")
                .header("Origin", "http://localhost:3002").header("X-CSRF-TOKEN", token))
                .andExpect(status().isNoContent()).andExpect(header().string("Access-Control-Expose-Headers", "Location")).andReturn();
        String location = response.getResponse().getHeader("Location");
        assertTrue(location.startsWith("https://issuer.example/oidc/logout?"));
        assertTrue(location.contains("logout_hint=provider-session-fixture"));
        assertTrue(location.contains("post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3002%2F"));
        assertFalse(location.contains("id_token"));
        assertFalse(location.contains("test-access-token"));
        assertTrue(session.isInvalid());
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }
}
