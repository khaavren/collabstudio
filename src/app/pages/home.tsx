import { ArrowRight, FolderTree, History, MessageSquare, Sparkles, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { Dashboard } from "@/app/pages/dashboard";
import { SiteTopNav } from "@/components/SiteTopNav";

type Feature = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const features: Feature[] = [
  {
    title: "Version History",
    description:
      "Track every iteration of your product development with complete visual and prompt history.",
    icon: History
  },
  {
    title: "Team Collaboration",
    description:
      "Real-time comments, annotations, and collaborative refinement of AI-generated outputs.",
    icon: Users
  },
  {
    title: "Organized Workflows",
    description: "Workspaces, rooms, and assets keep complex projects structured and navigable.",
    icon: FolderTree
  },
  {
    title: "Context Preservation",
    description:
      "Never lose the thread with full conversation history and decision trails maintained.",
    icon: MessageSquare
  },
  {
    title: "Works With Your AI",
    description:
      "Bring your own AI platform. Use ChatGPT, Claude, Gemini, or any model you prefer. MagisterLudi organizes the output, not the generation.",
    icon: Sparkles
  }
];

export function HomePage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Dashboard />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <SiteTopNav />

      <main className="flex-1">
        <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-16 pt-20 text-center md:pt-28">
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
            Bring Your Own AI Platform
          </span>

          <h1 className="mt-6 max-w-4xl text-balance text-4xl font-medium leading-tight tracking-tight md:text-6xl">
            Build Products Through Conversation
          </h1>

          <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
            A collaborative workspace for teams building with AI. Connect your favorite AI
            platform, ChatGPT, Claude, or any model you choose. MagisterLudi organizes your
            iterations, preserves context, and keeps your team aligned.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              to="/signup"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-2.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
              to="/login"
            >
              Login
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20" id="features">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
                key={feature.title}
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]">
                  <feature.icon className="h-5 w-5 text-[var(--primary)]" />
                </div>
                <h2 className="text-base font-medium text-[var(--foreground)]">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--background)]" id="about">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span>© {new Date().getFullYear()} MagisterLudi. All rights reserved.</span>
          </div>

          <nav className="flex items-center gap-5 text-sm text-[var(--muted-foreground)]">
            <a className="transition hover:text-[var(--foreground)]" href="#">
              Privacy
            </a>
            <a className="transition hover:text-[var(--foreground)]" href="#">
              Terms
            </a>
            <a className="transition hover:text-[var(--foreground)]" href="#">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
