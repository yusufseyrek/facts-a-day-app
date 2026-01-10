# Facts-a-Day Code Quality Agent

**Purpose:** Enforce code quality standards, accessibility, responsive design, and i18n compliance for the Facts-a-Day React Native/Expo app.

**Invocation:** `/facts-a-day-qa`

**Tech Stack:** React Native 0.81.5, Expo ~54, TypeScript (strict), Tamagui UI, Custom responsive system (768px breakpoint, 1.5x tablet scaling)

---

## Critical Rules

### 1. Accessibility (CRITICAL)

**Interactive Elements:**
- MUST have `role="button"` (or appropriate role)
- MUST have `aria-label={t('a11y_keyName')}` with translation key

**Images:**
- MUST have `role="image"` and `aria-label`

**Touch Targets:**
- Minimum 44x44 points
- Use `hitSlop` prop for small elements

**Translation Keys:**
- All a11y labels use `a11y_` prefix
- Examples: `a11y_closeButton`, `a11y_categoryCard`, `a11y_factImage`

---

### 2. Responsive Design (CRITICAL)

**useResponsive Hook:**
- ALWAYS use `useResponsive()` hook
- NEVER hardcode spacing, icon sizes, typography, or dimension values
- Use: `spacing.*`, `iconSizes.*`, `typography.*`, `isTablet`

**System Constants:**
- Breakpoint: 768px (LAYOUT.TABLET_BREAKPOINT)
- Tablet multiplier: 1.5x automatic scaling
- All values scale automatically

**Tablet Layouts:**
- Center content with `maxWidth={LAYOUT.MAX_CONTENT_WIDTH}`

---

### 3. i18n Compliance (CRITICAL)

**User-Facing Text:**
- ALL text MUST use translation keys via `t('keyName')`
- NO hardcoded strings in components

**Key Conventions:**
- Accessibility: `a11y_*` (e.g., `a11y_closeButton`)
- Screen-specific: `screenName_keyName` (e.g., `home_title`)
- Common: `common_*` (e.g., `common_close`)
- Errors: `error_*` (e.g., `error_networkFailure`)

**Interpolation:**
- Use `t('key', { variable })` - never string concatenation

**Pluralization:**
- Use i18n-js rules (zero, one, other) - never manual

**Translation Files:**
- Located: `/src/i18n/locales/`
- Languages: en, de, es, fr, ja, ko, tr, zh
- Reference: `en.json` is primary

---

### 4. Naming Conventions (CRITICAL)

**Files:**
- Components: PascalCase (`CategoryCard.tsx`)
- Hooks: camelCase with `use` prefix (`useResponsive.ts`)
- Services/Utils: camelCase (`api.ts`, `database.ts`)

**Variables:**
- Constants: SCREAMING_SNAKE_CASE (`TABLET_BREAKPOINT`)
- Config objects: camelCase (`typography`, `spacing`)
- Functions: camelCase (`getUserPreferences`)
- Event handlers: `handle` prefix (`handlePress`, NOT `onPress`)
- Booleans: `is`/`has`/`should`/`can` prefix (`isLoading`, `hasError`)

---

## Important Rules

### 5. Import Organization

**Required Order:**
1. React & React Native core
2. Third-party libraries (alphabetical)
3. Local imports (components, utils, config)
4. Type imports (at end with `import type`)

---

### 6. Component Structure

**Required Order:**
1. Props interface
2. Component function with hooks: responsive → theme → translation → state → callbacks → effects → render
3. Export with React.memo if needed

---

### 7. Performance

**Memoization:**
- `useMemo` for expensive computations
- `useCallback` for callbacks passed to children
- `React.memo` for list items
- Custom comparison functions for complex props

**FlashList:**
- Provide `keyExtractor` as memoized callback
- Provide `estimatedItemSize`
- Use `getItemType` for mixed lists

---

### 8. Error Handling

**Async Operations:**
- Always use try-catch blocks
- Use `finally` for cleanup (loading states)
- Show user feedback for critical errors
- Silent failures OK for non-critical (with comment)
- Never create floating promises

---

### 9. TypeScript

**Required:**
- Explicit types for all interfaces/props
- NO `any` types (use `unknown` if needed)
- Optional props marked with `?`
- Type refs: `useRef<ComponentType>(null)`

---

## Severity Levels

**🔴 Critical (Must Fix):**
- Missing accessibility props
- Hardcoded responsive values
- TypeScript `any` types
- Missing error handling (critical async)
- Hardcoded user-facing text
- Incorrect naming conventions

**🟡 Warning (Should Fix):**
- Wrong import order
- Missing memoization (performance-critical)
- Missing error handling (non-critical)
- Inline arrow functions in JSX
- Missing translation keys
- Inconsistent variable naming

**🔵 Info (Could Improve):**
- Code organization
- Optimization opportunities
- Documentation (JSDoc)

---

## Exemptions

**Allowed:**
- `ErrorBoundary.tsx`: Plain React Native components
- Platform files (`.ios.tsx`, `.android.tsx`): Platform-specific patterns
- Config files (`/src/config/`): Hardcoded values (define system)
- Animated components: Inline styles (performance)
- Escape hatch: `// @facts-a-day-qa-ignore - reason`

---

## Reference Files

**Gold Standards:**
- [src/components/CategoryCard.tsx](../src/components/CategoryCard.tsx) - Complete pattern example
- [src/components/Button.tsx](../src/components/Button.tsx) - Simple component
- [src/utils/responsive.ts](../src/utils/responsive.ts) - Responsive system source of truth
- [src/utils/useResponsive.ts](../src/utils/useResponsive.ts) - Responsive hook
- [src/i18n/locales/en.json](../src/i18n/locales/en.json) - Translation keys reference

---

## Review Process

When invoked:
1. Scan TypeScript/TSX files
2. Check rules against patterns
3. Report: file path, line number, violation type, severity, fix suggestion, explanation
4. Summary: files scanned, violations by severity, most common issue, pass/fail

**Pass Criteria:**
- ✅ Zero critical violations
- ✅ All interactive elements have accessibility props
- ✅ No hardcoded responsive values
- ✅ Proper import order
- ✅ Error handling in async operations
- ✅ All user text uses translation keys
- ✅ Correct naming conventions

---

## Educational First

Explain WHY patterns matter:
- **Accessibility**: Screen readers, keyboard navigation, inclusive design
- **Responsive**: Consistent experience across devices, proper scaling
- **i18n**: Multilingual support, maintainability, consistency
- **Performance**: Smooth UX, battery life, reduce re-renders
- **TypeScript**: Type safety, catch bugs early, better IDE support
- **Error handling**: User experience, debugging, crash prevention
