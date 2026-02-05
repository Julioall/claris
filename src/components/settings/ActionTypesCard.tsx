 import { useState, useEffect } from 'react';
 import { Plus, Trash2, Tag, Loader2 } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Input } from '@/components/ui/input';
 import { Badge } from '@/components/ui/badge';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { toast } from 'sonner';
 
 interface ActionType {
   id: string;
   name: string;
   label: string;
   isDefault?: boolean;
 }
 
 const DEFAULT_ACTION_TYPES: Omit<ActionType, 'id'>[] = [
   { name: 'contato', label: 'Contato', isDefault: true },
   { name: 'orientacao', label: 'Orientação', isDefault: true },
   { name: 'cobranca', label: 'Cobrança', isDefault: true },
   { name: 'suporte_tecnico', label: 'Suporte Técnico', isDefault: true },
   { name: 'reuniao', label: 'Reunião', isDefault: true },
   { name: 'outro', label: 'Outro', isDefault: true },
 ];
 
 export function ActionTypesCard() {
   const { user } = useAuth();
   const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
   const [newTypeName, setNewTypeName] = useState('');
   const [isLoading, setIsLoading] = useState(true);
   const [isAdding, setIsAdding] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
 
   const fetchActionTypes = async () => {
     if (!user) return;
     
     setIsLoading(true);
     try {
       const { data, error } = await supabase
         .from('action_types')
         .select('*')
         .eq('user_id', user.id)
         .order('created_at', { ascending: true });
 
       if (error) throw error;
 
       // If no custom types, initialize with defaults
       if (!data || data.length === 0) {
         await initializeDefaults();
       } else {
         setActionTypes(data.map(t => ({
           id: t.id,
           name: t.name,
           label: t.label,
           isDefault: DEFAULT_ACTION_TYPES.some(d => d.name === t.name)
         })));
       }
     } catch (err) {
       console.error('Error fetching action types:', err);
       toast.error('Erro ao carregar tipos de ação');
     } finally {
       setIsLoading(false);
     }
   };
 
   const initializeDefaults = async () => {
     if (!user) return;
     
     try {
       const defaultsToInsert = DEFAULT_ACTION_TYPES.map(t => ({
         user_id: user.id,
         name: t.name,
         label: t.label,
       }));
 
       const { data, error } = await supabase
         .from('action_types')
         .insert(defaultsToInsert)
         .select();
 
       if (error) throw error;
 
       setActionTypes((data || []).map(t => ({
         id: t.id,
         name: t.name,
         label: t.label,
         isDefault: DEFAULT_ACTION_TYPES.some(d => d.name === t.name)
       })));
     } catch (err) {
       console.error('Error initializing defaults:', err);
     }
   };
 
   useEffect(() => {
     fetchActionTypes();
   }, [user]);
 
   const handleAddType = async () => {
     if (!user || !newTypeName.trim()) return;
 
     const label = newTypeName.trim();
     const name = label
       .toLowerCase()
       .normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .replace(/\s+/g, '_')
       .replace(/[^a-z0-9_]/g, '');
 
     if (actionTypes.some(t => t.name === name)) {
       toast.error('Já existe um tipo com esse nome');
       return;
     }
 
     setIsAdding(true);
     try {
       const { data, error } = await supabase
         .from('action_types')
         .insert({
           user_id: user.id,
           name,
           label,
         })
         .select()
         .single();
 
       if (error) throw error;
 
       setActionTypes(prev => [...prev, {
         id: data.id,
         name: data.name,
         label: data.label,
         isDefault: false
       }]);
       setNewTypeName('');
       toast.success('Tipo de ação adicionado!');
     } catch (err) {
       console.error('Error adding action type:', err);
       toast.error('Erro ao adicionar tipo de ação');
     } finally {
       setIsAdding(false);
     }
   };
 
   const handleDeleteType = async (id: string) => {
     setDeletingId(id);
     try {
       const { error } = await supabase
         .from('action_types')
         .delete()
         .eq('id', id);
 
       if (error) throw error;
 
       setActionTypes(prev => prev.filter(t => t.id !== id));
       toast.success('Tipo de ação removido!');
     } catch (err) {
       console.error('Error deleting action type:', err);
       toast.error('Erro ao remover tipo de ação');
     } finally {
       setDeletingId(null);
     }
   };
 
   return (
     <Card>
       <CardHeader>
         <CardTitle className="text-lg flex items-center gap-2">
           <Tag className="h-5 w-5" />
           Tipos de Ação
         </CardTitle>
         <CardDescription>
           Gerencie os tipos de ação disponíveis para registro de intervenções
         </CardDescription>
       </CardHeader>
       <CardContent className="space-y-4">
         {isLoading ? (
           <div className="flex items-center justify-center py-6">
             <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
           </div>
         ) : (
           <>
             {/* Current types */}
             <div className="flex flex-wrap gap-2">
               {actionTypes.map((type) => (
                 <Badge
                   key={type.id}
                   variant={type.isDefault ? "secondary" : "default"}
                   className="flex items-center gap-1 py-1.5 px-3"
                 >
                   {type.label}
                   {!type.isDefault && (
                     <button
                       onClick={() => handleDeleteType(type.id)}
                       disabled={deletingId === type.id}
                       className="ml-1 hover:text-destructive transition-colors"
                     >
                       {deletingId === type.id ? (
                         <Loader2 className="h-3 w-3 animate-spin" />
                       ) : (
                         <Trash2 className="h-3 w-3" />
                       )}
                     </button>
                   )}
                 </Badge>
               ))}
             </div>
 
             {/* Add new type */}
             <div className="flex gap-2">
               <Input
                 placeholder="Nome do novo tipo..."
                 value={newTypeName}
                 onChange={(e) => setNewTypeName(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     e.preventDefault();
                     handleAddType();
                   }
                 }}
                 className="flex-1"
               />
               <Button
                 onClick={handleAddType}
                 disabled={isAdding || !newTypeName.trim()}
                 size="sm"
               >
                 {isAdding ? (
                   <Loader2 className="h-4 w-4 animate-spin" />
                 ) : (
                   <Plus className="h-4 w-4" />
                 )}
                 <span className="ml-1">Adicionar</span>
               </Button>
             </div>
 
             <p className="text-xs text-muted-foreground">
               Tipos padrão não podem ser removidos. Tipos personalizados aparecem em destaque.
             </p>
           </>
         )}
       </CardContent>
     </Card>
   );
 }