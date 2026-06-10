import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TamaguiProvider, Theme } from '@tamagui/core';
import { NavigationBar } from 'expo-navigation-bar';

import { config } from './config';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@app_theme_mode';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);

  // Determine actual theme based on mode
  const theme: 'light' | 'dark' =
    themeMode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themeMode;

  // Pin the NATIVE trait environment to the app's own theme toggle. The iOS 26
  // Liquid Glass chrome we don't render ourselves — the floating tab bar and
  // the native stack headers — resolves its light/dark material from the
  // system traits, NOT from our JS theme. With a forced in-app theme on a
  // mismatched system theme, that chrome rendered the wrong scheme and flipped
  // adaptively over content. (Also keys Android's AppCompat night mode.)
  // 'system' passes 'unspecified' = follow the OS again; useColorScheme keeps
  // working because the override only takes effect when a scheme is forced.
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'unspecified' : themeMode);
  }, [themeMode]);

  // Android edge-to-edge renders the system navigation bar (gesture pill /
  // 3-button icons) over app content, and its button contrast follows the
  // SYSTEM theme by default. The app has its own theme toggle, so key the bar
  // style to the RESOLVED app theme. NOTE the style names the CONTENT color
  // (StatusBar 'dark-content' convention): 'light' = LIGHT buttons (for our
  // dark background), 'dark' = DARK buttons (for our light background).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    try {
      NavigationBar.setStyle(theme === 'dark' ? 'light' : 'dark');
    } catch {
      // non-fatal: bar style stays on the system default
    }
  }, [theme]);

  // Load saved theme preference on mount
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Save theme preference when it changes
  useEffect(() => {
    if (isReady) {
      saveThemePreference(themeMode);
    }
  }, [themeMode, isReady]);

  const loadThemePreference = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedMode && (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system')) {
        setThemeModeState(savedMode as ThemeMode);
      }
    } catch (error) {
      console.warn('Failed to load theme preference:', error);
    } finally {
      setIsReady(true);
    }
  };

  const saveThemePreference = async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const toggleTheme = () => {
    setThemeModeState((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'light';
    });
  };

  if (!isReady) {
    return null; // or a loading screen
  }

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, toggleTheme }}>
      <TamaguiProvider config={config} defaultTheme={theme}>
        <Theme name={theme}>{children}</Theme>
      </TamaguiProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within AppThemeProvider');
  }
  return context;
}
