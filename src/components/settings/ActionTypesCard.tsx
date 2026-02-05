 import { useState, useEffect } from 'react';
 import { Plus, Trash2, Tag, Loader2, Pencil, X, Check } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Input } from '@/components/ui/input';
 import { Badge } from '@/components/ui/badge';
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
 } from '@/components/ui/alert-dialog';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
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
   const [editingType, setEditingType] = useState<ActionType | null>(null);
   const [editLabel, setEditLabel] = useState('');
   const [isSavingEdit, setIsSavingEdit] = useState(false);
   const [migrationDialog, setMigrationDialog] = useState<{
     open: boolean;
     typeToDelete: ActionType | null;
     actionsCount: number;
     targetTypeId: string;
   }>({ open: false, typeToDelete: null, actionsCount: 0, targetTypeId: '' });
 
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
 
   const checkTypeUsage = async (typeName: string): Promise<number> => {
     if (!user) return 0;
     
     try {
       const { count, error } = await supabase
         .from('actions')
         .select('*', { count: 'exact', head: true })
         .eq('user_id', user.id)
         .eq('action_type', typeName as any);
 
       if (error) throw error;
       return count || 0;
     } catch (err) {
       console.error('Error checking type usage:', err);
       return 0;
     }
   };
 
   const handleStartEdit = (type: ActionType) => {
     setEditingType(type);
     setEditLabel(type.label);
   };
 
   const handleCancelEdit = () => {
     setEditingType(null);
     setEditLabel('');
   };
 
   const handleSaveEdit = async () => {
     if (!editingType || !editLabel.trim()) return;
 
     setIsSavingEdit(true);
     try {
       const { error } = await supabase
         .from('action_types')
         .update({ label: editLabel.trim() })
         .eq('id', editingType.id);
 
       if (error) throw error;
 
       setActionTypes(prev => prev.map(t => 
         t.id === editingType.id ? { ...t, label: editLabel.trim() } : t
       ));
       setEditingType(null);
       setEditLabel('');
       toast.success('Tipo de ação atualizado!');
     } catch (err) {
       console.error('Error updating action type:', err);
       toast.error('Erro ao atualizar tipo de ação');
     } finally {
       setIsSavingEdit(false);
     }
   };
 
   const handleDeleteClick = async (type: ActionType) => {
     const usageCount = await checkTypeUsage(type.name);
     
     if (usageCount > 0) {
       // Type is in use, show migration dialog
       setMigrationDialog({
         open: true,
         typeToDelete: type,
         actionsCount: usageCount,
         targetTypeId: '',
       });
     } else {
       // Type not in use, delete directly
       handleDeleteType(type.id);
     }
   };
 
   const handleMigrateAndDelete = async () => {
     const { typeToDelete, targetTypeId } = migrationDialog;
     if (!typeToDelete || !targetTypeId || !user) return;
 
     const targetType = actionTypes.find(t => t.id === targetTypeId);
     if (!targetType) return;
 
     setDeletingId(typeToDelete.id);
     try {
       // First, migrate all actions to the new type
       const { error: updateError } = await supabase
         .from('actions')
         .update({ action_type: targetType.name as any })
         .eq('user_id', user.id)
         .eq('action_type', typeToDelete.name as any);
 
       if (updateError) throw updateError;
 
       // Then delete the type
       const { error: deleteError } = await supabase
         .from('action_types')
         .delete()
         .eq('id', typeToDelete.id);
 
       if (deleteError) throw deleteError;
 
       setActionTypes(prev => prev.filter(t => t.id !== typeToDelete.id));
       setMigrationDialog({ open: false, typeToDelete: null, actionsCount: 0, targetTypeId: '' });
       toast.success('Ações migradas e tipo removido!');
     } catch (err) {
       console.error('Error migrating and deleting:', err);
       toast.error('Erro ao migrar ações');
     } finally {
       setDeletingId(null);
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
                 editingType?.id === type.id ? (
                   <div key={type.id} className="flex items-center gap-1 bg-muted rounded-md p-1">
                     <Input
                       value={editLabel}
                       onChange={(e) => setEditLabel(e.target.value)}
                       className="h-7 w-32 text-sm"
                       autoFocus
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') handleSaveEdit();
                         if (e.key === 'Escape') handleCancelEdit();
                       }}
                     />
                     <Button
                       size="icon"
                       variant="ghost"
                       className="h-6 w-6"
                       onClick={handleSaveEdit}
                       disabled={isSavingEdit}
                     >
                       {isSavingEdit ? (
                         <Loader2 className="h-3 w-3 animate-spin" />
                       ) : (
                         <Check className="h-3 w-3 text-primary" />
                       )}
                     </Button>
                     <Button
                       size="icon"
                       variant="ghost"
                       className="h-6 w-6"
                       onClick={handleCancelEdit}
                       disabled={isSavingEdit}
                     >
                       <X className="h-3 w-3" />
                     </Button>
                   </div>
                 ) : (
                   <Badge
                     key={type.id}
                     variant={type.isDefault ? "secondary" : "default"}
                     className="flex items-center gap-1 py-1.5 px-3 group"
                   >
                     {type.label}
                     <button
                       onClick={() => handleStartEdit(type)}
                       className="ml-1 opacity-0 group-hover:opacity-100 hover:text-primary transition-all"
                     >
                       <Pencil className="h-3 w-3" />
                     </button>
                     {!type.isDefault && (
                       <button
                         onClick={() => handleDeleteClick(type)}
                         disabled={deletingId === type.id}
                         className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                       >
                         {deletingId === type.id ? (
                           <Loader2 className="h-3 w-3 animate-spin" />
                         ) : (
                           <Trash2 className="h-3 w-3" />
                         )}
                       </button>
                     )}
                   </Badge>
                 )
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
               Passe o mouse sobre um tipo para editar ou remover. Tipos padrão não podem ser removidos.
             </p>
           </>
         )}

         {/* Migration Dialog */}
         <AlertDialog 
           open={migrationDialog.open} 
           onOpenChange={(open) => !open && setMigrationDialog(prev => ({ ...prev, open: false }))}
         >
           <AlertDialogContent>
             <AlertDialogHeader>
               <AlertDialogTitle>Tipo em uso</AlertDialogTitle>
               <AlertDialogDescription>
                 O tipo "{migrationDialog.typeToDelete?.label}" está sendo usado por{' '}
                 <strong>{migrationDialog.actionsCount}</strong> ação(ões). 
                 Selecione outro tipo para migrar essas ações antes de excluir.
               </AlertDialogDescription>
             </AlertDialogHeader>
             
             <div className="py-4">
               <Select
                 value={migrationDialog.targetTypeId}
                 onValueChange={(value) => setMigrationDialog(prev => ({ ...prev, targetTypeId: value }))}
               >
                 <SelectTrigger>
                   <SelectValue placeholder="Selecione o tipo de destino..." />
                 </SelectTrigger>
                 <SelectContent>
                   {actionTypes
                     .filter(t => t.id !== migrationDialog.typeToDelete?.id)
                     .map(type => (
                       <SelectItem key={type.id} value={type.id}>
                         {type.label}
                       </SelectItem>
                     ))
                   }
                 </SelectContent>
               </Select>
             </div>
 
             <AlertDialogFooter>
               <AlertDialogCancel>Cancelar</AlertDialogCancel>
               <AlertDialogAction
                 onClick={handleMigrateAndDelete}
                 disabled={!migrationDialog.targetTypeId || deletingId !== null}
               >
                 {deletingId ? (
                   <>
                     <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                     Migrando...
                   </>
                 ) : (
                   'Migrar e excluir'
                 )}
               </AlertDialogAction>
             </AlertDialogFooter>
           </AlertDialogContent>
         </AlertDialog>
       </CardContent>
     </Card>
   );
 }