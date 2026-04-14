import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { DesignTokens } from "./pages/DesignTokens";
import { MessageBubblePage } from "./pages/MessageBubblePage";
import { VoiceRecorderPage } from "./pages/VoiceRecorderPage";
import { ScenarioCardPage } from "./pages/ScenarioCardPage";
import { LoadingPage } from "./pages/LoadingPage";
import { MockupsPage } from "./pages/MockupsPage";
import { FunctionalComponentsPage } from "./pages/FunctionalComponentsPage";
import { ProfileMockupPage } from "./pages/ProfileMockupPage";
import { PageTemplatesPage } from "./pages/PageTemplatesPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { HomePage } from "./pages/HomePage";
import { HelpPage } from "./pages/HelpPage";
import { TestimonialsPage } from "./pages/TestimonialsPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import { SubscriptionSuccessPage } from "./pages/SubscriptionSuccessPage";
import { SubscriptionDemoPage } from "./pages/SubscriptionDemoPage";
import { AiConversationPage } from "./pages/AiConversationPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: DesignTokens },
      { path: "design-tokens", Component: DesignTokens },
      { path: "message-bubble", Component: MessageBubblePage },
      { path: "voice-recorder", Component: VoiceRecorderPage },
      { path: "scenario-card", Component: ScenarioCardPage },
      { path: "loading", Component: LoadingPage },
      { path: "mockups", Component: MockupsPage },
      { path: "functional-components", Component: FunctionalComponentsPage },
      { path: "profile-mockup", Component: ProfileMockupPage },
      { path: "page-templates", Component: PageTemplatesPage },
      { path: "onboarding", Component: OnboardingPage },
      { path: "home", Component: HomePage },
      { path: "help", Component: HelpPage },
      { path: "testimonials", Component: TestimonialsPage },
      { path: "subscription", Component: SubscriptionPage },
      { path: "subscription/success", Component: SubscriptionSuccessPage },
      { path: "subscription/demo", Component: SubscriptionDemoPage },
      { path: "ai-conversation", Component: AiConversationPage },
    ],
  },
]);