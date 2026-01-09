import React, { createContext, useContext, useCallback, useRef } from "react";

type ScrollToTopFn = () => void;

interface ScrollToTopContextValue {
  registerScrollToTop: (tabName: string, scrollFn: ScrollToTopFn) => void;
  unregisterScrollToTop: (tabName: string) => void;
  scrollToTop: (tabName: string) => void;
}

const ScrollToTopContext = createContext<ScrollToTopContextValue | null>(null);

export function ScrollToTopProvider({ children }: { children: React.ReactNode }) {
  const scrollFunctionsRef = useRef<Map<string, ScrollToTopFn>>(new Map());

  const registerScrollToTop = useCallback((tabName: string, scrollFn: ScrollToTopFn) => {
    console.log(`📜 Registering scrollToTop handler for tab: ${tabName}`);
    scrollFunctionsRef.current.set(tabName, scrollFn);
  }, []);

  const unregisterScrollToTop = useCallback((tabName: string) => {
    scrollFunctionsRef.current.delete(tabName);
  }, []);

  const scrollToTop = useCallback((tabName: string) => {
    const scrollFn = scrollFunctionsRef.current.get(tabName);
    console.log(`📜 ScrollToTop called for tab: ${tabName}, has handler: ${!!scrollFn}`);
    if (scrollFn) {
      scrollFn();
    }
  }, []);

  return (
    <ScrollToTopContext.Provider value={{ registerScrollToTop, unregisterScrollToTop, scrollToTop }}>
      {children}
    </ScrollToTopContext.Provider>
  );
}

export function useScrollToTop() {
  const context = useContext(ScrollToTopContext);
  if (!context) {
    throw new Error("useScrollToTop must be used within a ScrollToTopProvider");
  }
  return context;
}

export function useScrollToTopHandler(tabName: string, scrollFn: ScrollToTopFn) {
  const { registerScrollToTop, unregisterScrollToTop } = useScrollToTop();

  React.useEffect(() => {
    registerScrollToTop(tabName, scrollFn);
    return () => unregisterScrollToTop(tabName);
  }, [tabName, scrollFn, registerScrollToTop, unregisterScrollToTop]);
}
