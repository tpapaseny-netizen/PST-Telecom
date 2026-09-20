// Penc — prototype natif (React Native / Expo)
// Se connecte au VRAI backend de production (server-at.js sur Render).
// Aucune modification côté serveur nécessaire — ce client consomme les mêmes
// routes que messager.html (/api/penc/auth/login, /api/penc/conversations).

import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from './screens/LoginScreen';
import ConversationsScreen from './screens/ConversationsScreen';
import ChatScreen from './screens/ChatScreen';
import StatusesScreen from './screens/StatusesScreen';
import StatusComposeScreen from './screens/StatusComposeScreen';
import StatusViewerScreen from './screens/StatusViewerScreen';
import { setAuthToken } from './api/client';

const Stack = createNativeStackNavigator();

export default function App() {
  const [booting, setBooting] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Login');

  // Au démarrage : si un token a déjà été sauvegardé lors d'une session
  // précédente, on saute directement l'écran de connexion — même logique
  // que le PWA qui garde l'utilisateur connecté entre deux ouvertures.
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('penc_token');
        if (savedToken) {
          setAuthToken(savedToken);
          setInitialRoute('Conversations');
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a73e8' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Conversations" component={ConversationsScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Statuses" component={StatusesScreen} />
        <Stack.Screen
          name="StatusCompose"
          component={StatusComposeScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="StatusViewer"
          component={StatusViewerScreen}
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}