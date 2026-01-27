import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthContextType } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock user for development (simulating Moodle auth)
const MOCK_USER: User = {
  id: 'mock-user-id',
  moodle_user_id: '12345',
  moodle_username: 'tutor.demo',
  full_name: 'Maria Silva',
  email: 'maria.silva@senai.br',
  avatar_url: undefined,
  last_login: new Date().toISOString(),
  last_sync: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('guia_tutor_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        setLastSync(parsed.last_sync);
      } catch {
        localStorage.removeItem('guia_tutor_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string, moodleUrl: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      // TODO: Replace with actual Moodle API authentication
      // For now, simulate successful login for demo
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check credentials (demo mode)
      if (!username || !password) {
        toast({
          title: "Erro de autenticação",
          description: "Usuário e senha são obrigatórios",
          variant: "destructive",
        });
        return false;
      }

      // Create/update user in Supabase
      const newUser: User = {
        ...MOCK_USER,
        moodle_username: username,
        full_name: username.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
        last_login: new Date().toISOString(),
        last_sync: new Date().toISOString(),
      };

      // Store in local storage for session persistence
      localStorage.setItem('guia_tutor_user', JSON.stringify(newUser));
      setUser(newUser);
      setLastSync(newUser.last_sync!);
      
      toast({
        title: "Login realizado com sucesso",
        description: `Bem-vindo, ${newUser.full_name}!`,
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Erro de autenticação",
        description: "Não foi possível conectar ao Moodle. Verifique suas credenciais.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('guia_tutor_user');
    setUser(null);
    setLastSync(null);
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
  }, []);

  const syncData = useCallback(async () => {
    if (!user) return;
    
    try {
      toast({
        title: "Sincronizando...",
        description: "Atualizando dados do Moodle",
      });

      // TODO: Implement actual Moodle sync
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newSyncTime = new Date().toISOString();
      setLastSync(newSyncTime);
      
      const updatedUser = { ...user, last_sync: newSyncTime };
      localStorage.setItem('guia_tutor_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      toast({
        title: "Sincronização concluída",
        description: "Dados atualizados com sucesso!",
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: "Erro na sincronização",
        description: "Não foi possível sincronizar com o Moodle.",
        variant: "destructive",
      });
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        syncData,
        lastSync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
