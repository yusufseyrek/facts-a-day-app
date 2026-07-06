// The settings tab's own-profile route. Opened without a `name` param, the
// trivia profile screen resolves the local identity (or shows the profile
// setup state when no name is claimed yet). Registered inside this stack so
// the push stays on the settings tab instead of jumping to the trivia tab.
export { default } from '../trivia/profile';
