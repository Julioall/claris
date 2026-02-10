-- ============================================================
-- Add soft delete functionality to actions table
-- Actions moved to trash stay for 90 days before auto-deletion
-- ============================================================

-- Add deleted_at column to actions table
ALTER TABLE public.actions 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for better query performance on deleted items
CREATE INDEX idx_actions_deleted_at ON public.actions(deleted_at) WHERE deleted_at IS NOT NULL;

-- Function to permanently delete old trashed actions (older than 90 days)
CREATE OR REPLACE FUNCTION delete_old_trashed_actions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.actions
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Create a scheduled job to run cleanup daily
-- Note: This requires pg_cron extension which needs to be enabled
-- If pg_cron is not available, this can be called manually or via edge function
COMMENT ON FUNCTION delete_old_trashed_actions() IS 
'Deletes actions that have been in trash for more than 90 days. Should be run daily via cron job or edge function.';

-- Update RLS policy for actions to exclude deleted items by default
DROP POLICY IF EXISTS "Users can view actions" ON public.actions;
CREATE POLICY "Users can view actions" ON public.actions
FOR SELECT USING (
  user_id = auth.uid() AND deleted_at IS NULL
);

-- Add policy to view trashed items
CREATE POLICY "Users can view own trashed actions" ON public.actions
FOR SELECT USING (
  user_id = auth.uid() AND deleted_at IS NOT NULL
);

-- Policy for soft delete (update to set deleted_at)
DROP POLICY IF EXISTS "Users can update actions" ON public.actions;
CREATE POLICY "Users can update actions" ON public.actions
FOR UPDATE USING (user_id = auth.uid());

-- Add policy for permanent deletion (only for items already in trash)
DROP POLICY IF EXISTS "Users can delete actions" ON public.actions;
CREATE POLICY "Users can delete actions" ON public.actions
FOR DELETE USING (
  user_id = auth.uid() AND deleted_at IS NOT NULL
);
