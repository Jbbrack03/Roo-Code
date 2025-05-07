/// <reference types="react" />

import { useEffect } from 'react';
import { initWebAssemblyLoader } from './utils/wasmloader';

// Declare the global vscodeApi on window
declare global {
  interface Window {
    vscodeApi?: {
      getState: () => { extensionContext?: any } | undefined;
    }
  }
}

// Convert to a proper React component
export default function App() {
  useEffect(() => {
    if (window.vscodeApi) {
      try {
        initWebAssemblyLoader(window.vscodeApi.getState()?.extensionContext);
      } catch (error) {
        console.error("Failed to initialize WebAssembly loader:", error);
      }
    }
  }, []);
  
  return null; // This component doesn't render anything
} 