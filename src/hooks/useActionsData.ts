 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { ActionType, ActionStatus } from '@/types';
 
 interface ActionWithRelations {
   id: string;
   student_id: string;
   course_id?: string;
   user_id: string;
   action_type: ActionType;
   description: string;
   status: ActionStatus;
   scheduled_date?: string;
   completed_at?: string;
   created_at: string;
   updated_at?: string;
   deleted_at?: string;
   student?: {
     id: string;
     full_name: string;
   };
   course?: {
     id: string;
     short_name: string;
   };
 }
 
 export function useActionsData(includeDeleted: boolean = false) {
   const { user } = useAuth();
   const [actions, setActions] = useState<ActionWithRelations[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
 
   const fetchActions = useCallback(async () => {
     if (!user) {
       setActions([]);
       setIsLoading(false);
       return;
     }
 
     setIsLoading(true);
     setError(null);
 
     try {
       let query = supabase
         .from('actions')
         .select(`
           *,
           students (
             id,
             full_name
           ),
           courses (
             id,
             short_name
           )
         `)
         .eq('user_id', user.id);

       // Filter by deleted status
       if (includeDeleted) {
         query = query.not('deleted_at', 'is', null);
       } else {
         query = query.is('deleted_at', null);
       }

       const { data, error: fetchError } = await query.order('created_at', { ascending: false });

       if (fetchError) throw fetchError;

       const formattedActions: ActionWithRelations[] = (data || []).map(action => ({
         id: action.id,
         student_id: action.student_id,
         course_id: action.course_id || undefined,
         user_id: action.user_id,
         action_type: action.action_type as ActionType,
         description: action.description,
         status: action.status as ActionStatus,
         scheduled_date: action.scheduled_date || undefined,
         completed_at: action.completed_at || undefined,
         created_at: action.created_at || new Date().toISOString(),
         updated_at: action.updated_at || undefined,
         deleted_at: action.deleted_at || undefined,
         student: action.students ? {
           id: (action.students as any).id,
           full_name: (action.students as any).full_name,
         } : undefined,
         course: action.courses ? {
           id: (action.courses as any).id,
           short_name: (action.courses as any).short_name,
         } : undefined,
       }));
 
       setActions(formattedActions);
     } catch (err) {
       console.error('Error fetching actions:', err);
       setError(err instanceof Error ? err.message : 'Erro ao carregar ações');
     } finally {
       setIsLoading(false);
     }
   }, [user, includeDeleted]);
 
   const markAsCompleted = useCallback(async (actionId: string) => {
     try {
       const { error: updateError } = await supabase
         .from('actions')
         .update({
           status: 'concluida',
           completed_at: new Date().toISOString(),
         })
         .eq('id', actionId);
 
       if (updateError) throw updateError;
 
       // Refetch to update list
       await fetchActions();
       return true;
     } catch (err) {
       console.error('Error marking action as completed:', err);
       return false;
     }
   }, [fetchActions]);

   const moveToTrash = useCallback(async (actionId: string) => {
     try {
       const { error: updateError } = await supabase
         .from('actions')
         .update({
           deleted_at: new Date().toISOString(),
         })
         .eq('id', actionId);
 
       if (updateError) throw updateError;
 
       // Refetch to update list
       await fetchActions();
       return true;
     } catch (err) {
       console.error('Error moving action to trash:', err);
       return false;
     }
   }, [fetchActions]);

   const restoreFromTrash = useCallback(async (actionId: string) => {
     try {
       const { error: updateError } = await supabase
         .from('actions')
         .update({
           deleted_at: null,
         })
         .eq('id', actionId);
 
       if (updateError) throw updateError;
 
       // Refetch to update list
       await fetchActions();
       return true;
     } catch (err) {
       console.error('Error restoring action from trash:', err);
       return false;
     }
   }, [fetchActions]);

   const deletePermanently = useCallback(async (actionId: string) => {
     try {
       const { error: deleteError } = await supabase
         .from('actions')
         .delete()
         .eq('id', actionId)
         .not('deleted_at', 'is', null); // Only delete if already in trash
 
       if (deleteError) throw deleteError;
 
       // Refetch to update list
       await fetchActions();
       return true;
     } catch (err) {
       console.error('Error deleting action permanently:', err);
       return false;
     }
   }, [fetchActions]);
 
   useEffect(() => {
     fetchActions();
   }, [fetchActions]);
 
   return { 
     actions, 
     isLoading, 
     error, 
     refetch: fetchActions, 
     markAsCompleted,
     moveToTrash,
     restoreFromTrash,
     deletePermanently
   };
 }