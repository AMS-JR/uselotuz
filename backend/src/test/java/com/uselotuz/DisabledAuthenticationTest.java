package com.uselotuz;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "lotuz.oidc.enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DisabledAuthenticationTest {
    @Autowired MockMvc mvc;
    @Test void unconfiguredProviderFailsClosed() throws Exception {
        mvc.perform(get("/api/auth/config")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        mvc.perform(get("/api/businesses")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").with(oidcLogin())).andExpect(status().isForbidden());
        mvc.perform(get("/oauth2/authorization/lotuz")).andExpect(status().isUnauthorized());
    }
}
