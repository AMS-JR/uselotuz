import { ButtonLink } from "@uselotuz/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="mt-4 text-4xl font-semibold">Page not found</h1>
      <p className="my-6 text-muted-foreground">
        Return to Lotuz to explore our products.
      </p>
      <ButtonLink href="/">Back to home</ButtonLink>
    </main>
  );
}
