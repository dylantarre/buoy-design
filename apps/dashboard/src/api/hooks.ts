import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { GuardrailConfig } from '../types';
import { api } from './client';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
  });
}

export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.getInbox(),
  });
}

export function useGuardrails() {
  return useQuery({
    queryKey: ['guardrails'],
    queryFn: () => api.getGuardrails(),
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: () => api.getActivity(),
  });
}

export function useInboxAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: string }) =>
      api.performInboxAction(itemId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateGuardrails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<GuardrailConfig>) => api.updateGuardrails(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardrails'] });
    },
  });
}
