import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Package,
  Store,
  Utensils,
} from "lucide-react";
import { ButtonLink, Card } from "@uselotuz/ui";
import { Brand } from "../components/brand";

const principles = [
  {
    number: "01",
    title: "One clear job",
    text: "Focused tools for the everyday work of running a small business.",
  },
  {
    number: "02",
    title: "Useful on its own",
    text: "Each product is designed to stand alone. Start with the tool that fits your business.",
  },
  {
    number: "03",
    title: "Built around your day",
    text: "Clear screens and practical workflows, shaped by the people who use them.",
  },
];

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only fixed left-4 top-4 z-50 rounded-control bg-surface p-3 focus:not-sr-only"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-6 text-sm font-medium"
          >
            <a
              href="#products"
              className="transition-colors hover:text-primary"
            >
              Products
            </a>
            <a
              href="#approach"
              className="transition-colors hover:text-primary"
            >
              Our approach
            </a>
          </nav>
        </div>
      </header>
      <main id="main">
        <section
          className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1.3fr_1fr] md:items-center md:py-28"
          aria-labelledby="hero-title"
        >
          <div>
            <p className="mb-6 flex items-center gap-2 text-sm font-medium text-primary">
              <span className="size-2 rounded-full bg-primary" /> Independent
              business. Focused tools.
            </p>
            <h1
              id="hero-title"
              className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl"
            >
              More clarity.
              <br />
              More room to <span className="text-primary">grow.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground">
              Running a small business takes enough juggling. We’re building
              focused tools to make the everyday work feel simpler.
            </p>
            <ButtonLink href="#products" className="mt-8">
              Explore our products{" "}
              <ArrowDown aria-hidden="true" className="size-4" />
            </ButtonLink>
            <p className="mt-4 text-sm text-muted-foreground">
              For independent stores and restaurants.
            </p>
          </div>
          <div className="relative rounded-card border border-border bg-gradient-to-br from-surface to-primary/5 p-7 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Our starting point
            </p>
            <div className="my-8 flex size-14 items-center justify-center rounded-card bg-primary/10 text-primary">
              <Package aria-hidden="true" className="size-7" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                Lotuz Inventory
              </h2>
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium">
                Planned
              </span>
            </div>
            <p className="mt-4 leading-7 text-muted-foreground">
              A clearer picture of what’s on your shelves and what needs your
              attention.
            </p>
            <div className="mt-8 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
              Our first product candidate. Its scope will be shaped by customer
              validation.
            </div>
          </div>
        </section>
        <section
          id="products"
          className="border-y border-border bg-surface"
          aria-labelledby="products-title"
        >
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-3 text-sm font-medium text-primary">
                  The product directory
                </p>
                <h2
                  id="products-title"
                  className="text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  A focused place to start.
                </h2>
              </div>
              <p className="max-w-sm leading-7 text-muted-foreground">
                One product at a time, built around a real business need.
              </p>
            </div>
            <Card className="grid gap-8 md:grid-cols-[1fr_1fr] md:p-9">
              <div>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
                  Under consideration · Not yet available
                </p>
                <h3 className="text-2xl font-semibold">Lotuz Inventory</h3>
                <p className="mt-4 max-w-md leading-7 text-muted-foreground">
                  A proposed tool for tracking stock and planning reorders,
                  without losing sight of how stock changes.
                </p>
              </div>
              <div className="md:border-l md:border-border md:pl-9">
                <p className="mb-4 text-sm font-medium">What we’re exploring</p>
                <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                  {[
                    "Stock receiving and adjustments",
                    "An auditable history of movements",
                    "Low-stock views and reorder lists",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-primary"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-5 text-muted-foreground">
                  Proposed scope; priorities may change through customer
                  validation.
                </p>
              </div>
            </Card>
          </div>
        </section>
        <section
          id="approach"
          className="mx-auto max-w-6xl px-6 py-20"
          aria-labelledby="approach-title"
        >
          <p className="mb-3 text-sm font-medium text-primary">
            The Lotuz approach
          </p>
          <h2
            id="approach-title"
            className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Small tools. A clear purpose.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {principles.map((item) => (
              <Card key={item.number}>
                <p className="mb-8 text-sm font-medium text-primary">
                  {item.number}
                </p>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {item.text}
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Made with independent owners in mind
            </p>
            <span className="flex items-center gap-2">
              <Store aria-hidden="true" className="size-4" /> Stores &amp;
              grocers
            </span>
            <span className="flex items-center gap-2">
              <Utensils aria-hidden="true" className="size-4" /> Restaurants
              &amp; cafés
            </span>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-7 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Brand />
            <p>Focused tools for independent businesses.</p>
          </div>
          <a
            href="#products"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
          >
            Explore products{" "}
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </footer>
    </>
  );
}
