/**
 * OFFGRID — root component
 * Offline-first group communication and safety.
 * See CLAUDE.md and docs/ for architecture.
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootStack } from './src/navigation/RootStack';
import { bootstrapApp } from './src/services/appBootstrap';
import { useAppFoundationStore } from './src/store/appFoundationStore';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const setLoading = useAppFoundationStore(s => s.setLoading);
  const setReady = useAppFoundationStore(s => s.setReady);
  const setError = useAppFoundationStore(s => s.setError);

  useEffect(() => {
    try {
      setLoading();
      const result = bootstrapApp();
      setReady({
        schemaVersion: result.schemaVersion,
        localDeviceId: result.deviceId,
        deviceWasCreated: result.deviceWasCreated,
        localUserId: result.userId,
        userWasCreated: result.userWasCreated,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setLoading, setReady, setError]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <RootStack />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
