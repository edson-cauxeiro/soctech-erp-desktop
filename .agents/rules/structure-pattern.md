# Project Rules

> Rules for the Antigravity agent. Loaded from `.agent/rules/`.

# TypeScript + Node.js + React Agent Rules

## Project Context
You are an expert TypeScript developer working with Node.js runtime and React. This project is a Web App.

## Code Style & Structure
### Google TypeScript Style Guide
- Use Google-style JSDoc docstrings for every public module, class, function, and method.
- Annotate all functions, methods, class members, and variables with specific TypeScript types.
- Structure docstrings with Args, Returns, and Throws sections for parameters, return values, and exceptions.
- Use `interface` for object shapes and `type` for unions/aliases: `interface User { id: string; name: string }` vs `type Status = 'active' | 'inactive'`.
- Write `@param` and `@returns` JSDoc for all public APIs: `/** @param id - User identifier. @returns The user record or null if not found. */`.
- Annotate return types explicitly on public APIs: `async function fetchUser(id: string): Promise<User | null>` — never rely on inference for exported functions.
- Prefer `unknown` over `any`; narrow with type guards: `if (typeof val === 'string') { processString(val); }`.

### Functional Patterns
- Prefer pure functions: given the same inputs, always return the same output with no side effects.
- Use immutable data structures; avoid mutating variables or objects after creation.
- Favor function composition and pipelines over deeply nested logic.
- Use higher-order functions (map, filter, reduce) instead of manual loops for collection transformations.
- Separate side effects (I/O, network, state) from pure computation; push effects to the edges of your program.
- Prefer declarative code that describes *what* to compute rather than *how* to compute it step by step.
- Use closures and partial application to create reusable, configurable function factories.

## Linting & Formatting
### Biome
- Run `biome check --write .` for combined linting + formatting — configure `biome.json` to enable TypeScript-specific lint rules.
- Use Biome's `organizeImports` to auto-sort imports — it replaces separate import-sorting plugins.
- Run `biome ci .` in CI (strict mode, no auto-fix) and `biome check --write .` locally for development auto-fixes.
- Enable recommended rules: `"linter": { "rules": { "recommended": true } }`.
- Use `biome ci` in CI pipelines — it exits non-zero on any violation without auto-fixing.
- Use `biome.json` overrides for file-specific rule configuration (e.g., relaxed rules for test files).

## Styling
### Tailwind CSS
- Use `@apply` in component CSS only as a last resort — prefer utility classes in templates.
- Use the `cn()` (clsx + twMerge) utility for conditional class merging — it resolves Tailwind class conflicts correctly.
- Use `tailwind.config.ts` to define design tokens: colors, spacing, fonts, breakpoints.
- Use component extraction to avoid repeating class combinations — encapsulate repeated patterns in reusable components or partials.
- Use responsive prefixes (`sm:`, `md:`, `lg:`) for mobile-first responsive design.
- Use `dark:` variant for dark mode support. Use `group-*` and `peer-*` for conditional styling.

## React
- Define a `Props` interface for every component and type the function signature: `function Button({ label, onClick }: Props)`.
- Use generic hooks for type safety: `useState<User | null>(null)`, `useRef<HTMLInputElement>(null)`, `useReducer<Reducer<State, Action>>`.
- Type event handlers explicitly: `React.MouseEvent<HTMLButtonElement>`, `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`.
- Use `React.FC` sparingly — prefer explicit return types: `function Card({ title }: Props): React.ReactElement`. Use generic components: `function List<T>({ items, renderItem }: ListProps<T>)`.
- Prefer `interface Props` over `React.FC<Props>` — define props as an interface and use a regular function declaration for components.
- Use `React.ComponentPropsWithoutRef<'button'>` to extend native HTML element props when wrapping built-in elements.
- Type children explicitly: use `React.ReactNode` for renderable content, `React.ReactElement` when only JSX elements are accepted.
- Create typed context with a factory: `createContext<ContextType | null>(null)` and a custom hook that throws if used outside the provider.
- Use discriminated unions for component variants: `type Props = { variant: 'link'; href: string } | { variant: 'button'; onClick: () => void }`.

## Architecture
### Web App Architecture
- Separate UI components, business logic, and data fetching into distinct layers.
- Choose rendering strategy intentionally: SSR for SEO, CSR for interactivity, SSG for static content.
- Use server-side rendering (SSR) or static generation (SSG) for initial page loads — hydrate on the client for interactivity.
- Implement client-side routing with proper loading and error states for each route.
- Use a state management approach appropriate to complexity — local state first, global store when needed.

## Error Handling
### Try/Catch
- Use try/catch blocks for error handling. Catch specific error types, not generic exceptions.
- Never catch errors silently — always log, handle, or rethrow with additional context.
- Log the full error stack trace at the catch site — re-throw with additional context if the error needs to propagate up the call chain.
- Provide meaningful error messages that include what operation failed and why.
- Use typed error hierarchies: ValidationError, NotFoundError, AuthenticationError — not generic Error.
- Log errors with structured data: operation name, input parameters, stack trace, and timestamp.
- Use finally blocks for cleanup that must run regardless of success or failure.

## Testing
### E2E Testing
- Write E2E tests for critical user journeys: signup, login, checkout, core workflows.
- Run E2E tests before deploying or merging major features — they catch what unit tests miss.
- Keep E2E tests stable by using data-testid attributes or accessible roles, not brittle CSS selectors.
- Test the happy path of every critical user flow. Add negative cases for important error scenarios.
- Use page object or component object patterns to encapsulate UI interactions and reduce test duplication.
- Set up isolated test data for each test run — never depend on production or shared staging data.
- Add retry logic for flaky network-dependent steps, but investigate and fix flakiness rather than masking it.
- Run E2E tests in CI on every PR. Block merges on E2E failures for critical paths.

### Playwright
- Use Playwright for E2E, integration, and browser tests simulating user interactions.
- Write tests in TypeScript for type-safe selectors, actions, and assertions.
- Run tests via `npx playwright test` or npm scripts for local and CI execution.
- Test across Chromium, Firefox, and WebKit browsers for cross-browser reliability.
- Configure playwright.config.ts with baseURL, viewport sizes, and timeouts to match production environments and reduce flakiness.
- Leverage auto-waiting features and expect() assertions for robust, low-maintenance tests without manual sleeps.
- Enable tracing, screenshots, and video capture on failure for efficient debugging of intermittent issues.
- Use getByRole, getByText, or getByTestId locators prioritizing accessibility over fragile selectors.

### Vitest
- For TypeScript: Only write Vitest tests when resolving a specific user issue or upon explicit request.
- Import core functions as `import { describe, it, expect } from 'vitest';`.
- Use jsdom environment for DOM-related tests and node for others.
- Write focused, isolated test cases.
- Configure Vitest coverage with exclusion patterns and multiple report formats.
- Mock modules with `vi.mock('../db', () => ({ query: vi.fn<[string], Promise<Row[]>>() }))` — use generic type parameters on `vi.fn<TArgs, TReturn>()` for type-safe mock functions.
- Use `vi.spyOn(obj, 'method').mockResolvedValue(result)` to patch individual methods with typed return values.
- Assert async results: `await expect(fetchUser('1')).resolves.toMatchObject({ id: '1', name: expect.any(String) })` and `await expect(fetchUser('')).rejects.toThrow('invalid id')`.
- Use `vi.useFakeTimers()` with `vi.advanceTimersByTime(ms)` to test debounced functions and polling intervals without real delays.
- Configure per-file environment: `// @vitest-environment jsdom` for DOM tests, `// @vitest-environment node` for server-side code.

## Libraries & Tools
### Zod
- Define schemas with `z.object({})` for validation — use `z.infer<typeof schema>` to derive TypeScript types from schemas.
- Validate at system boundaries: API inputs, form data, environment variables, config files — fail fast with descriptive error messages.
- Use `z.enum()` for string literals, `z.discriminatedUnion()` for tagged unions, `z.transform()` for parsing and coercion.
- Use `.parse()` to throw on invalid data, `.safeParse()` to get a Result-like `{ success, data, error }`.
- Compose schemas: use `.extend()`, `.merge()`, `.pick()`, `.omit()` to build variants from base schemas.
- Use `.transform()` for coercion and normalization (trimming strings, parsing dates).

### Prisma
- Define models in `schema.prisma`. Use `prisma migrate dev` for development, `prisma migrate deploy` for production.
- Use Prisma Client for all database queries — never write raw SQL unless absolutely necessary.
- Use `prisma.$transaction()` for multi-step operations that must succeed or fail atomically — prevents partial data corruption.
- Use `include` and `select` to control query shape — avoid over-fetching related data.
- Use transactions (`prisma.$transaction`) for multi-step operations that must be atomic.
- Use `@unique`, `@index`, and `@@index` for query performance. Add indexes for frequently filtered columns.
- Use `prisma generate` after schema changes to update the TypeScript client types.

### TanStack Query
- Invalidate related queries after mutations with `queryClient.invalidateQueries({ queryKey: [...] })`.
- Set `staleTime` per query based on data volatility — `Infinity` for static data, short durations for frequently changing data.
- Structure query keys hierarchically: `["users"]`, `["users", userId]`, `["users", userId, "posts"]`.
- Use `queryFn` to wrap your API client — keep TanStack Query as the caching layer, not the fetcher.
- Use `staleTime` to control refetch frequency. Set app-wide defaults in `QueryClient`.
- Use `enabled` option to conditionally disable queries (e.g., wait for auth, dependent queries).

### Zustand
- Create stores with `create()`: define state and actions in a single function. Access with hooks.
- Keep stores small and focused — one store per domain concern, not one global store.
- Use selectors (`useStore(state => state.count)`) to subscribe to specific state slices — prevents unnecessary re-renders from unrelated changes.
- Use selectors to subscribe to specific state slices: `useStore((state) => state.count)` — avoid re-renders from unrelated state changes.
- Use `immer` middleware for immutable updates on deeply nested state.
- Define actions inside the store alongside state — colocate state and the logic that modifies it.
- Use `persist` middleware for localStorage/sessionStorage persistence.

### React Hook Form
- Use `useForm<FormValues>()` with a schema resolver for type-safe, schema-validated forms.
- Use `register()` for uncontrolled inputs, `Controller` for controlled components (Select, DatePicker).
- Use `useFormContext<FormData>()` in nested components with `FormProvider` — maintains full TypeScript types without prop drilling.
- Use `handleSubmit` wrapper — it validates before calling your submit handler.
- Use `formState.errors` for field-level error display. Show errors next to the relevant input.
- Use `watch()` sparingly — prefer `useWatch()` for isolated re-renders on specific fields.
- Use `defaultValues` to initialize forms. Use `reset()` to clear forms after successful submission.
