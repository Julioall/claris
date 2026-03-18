export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      actions: {
        Row: {
          action_type: string
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          description: string
          id: string
          scheduled_date: string | null
          status: string | null
          student_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          scheduled_date?: string | null
          status?: string | null
          student_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          scheduled_date?: string | null
          status?: string | null
          student_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_feed: {
        Row: {
          course_id: string | null
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          metadata: Json | null
          student_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          student_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          student_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permissions: Json
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permissions?: Json
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permissions?: Json
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_error_logs: {
        Row: {
          category: string
          context: Json | null
          created_at: string
          id: string
          message: string
          payload: Json | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          payload?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          payload?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_error_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          name: string
          payload: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          name: string
          payload?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          name?: string
          payload?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          claris_llm_settings: Json
          created_at: string
          moodle_connection_service: string
          moodle_connection_url: string
          risk_threshold_days: Json
          singleton_id: string
          updated_at: string
        }
        Insert: {
          claris_llm_settings?: Json
          created_at?: string
          moodle_connection_service?: string
          moodle_connection_url?: string
          risk_threshold_days?: Json
          singleton_id?: string
          updated_at?: string
        }
        Update: {
          claris_llm_settings?: Json
          created_at?: string
          moodle_connection_service?: string
          moodle_connection_url?: string
          risk_threshold_days?: Json
          singleton_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_usage_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          resource: string | null
          route: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          resource?: string | null
          route?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          resource?: string | null
          route?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_course_settings: {
        Row: {
          course_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_course_settings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_course_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_date: string
          course_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          student_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_date: string
          course_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status: string
          student_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_date?: string
          course_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_message_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_count: number
          id: string
          message_content: string
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["bulk_message_status"]
          template_id: string | null
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          message_content: string
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["bulk_message_status"]
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          message_content?: string
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["bulk_message_status"]
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_message_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_message_recipients: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          moodle_user_id: string
          personalized_message: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["bulk_recipient_status"]
          student_id: string
          student_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          moodle_user_id: string
          personalized_message?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["bulk_recipient_status"]
          student_id: string
          student_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          moodle_user_id?: string
          personalized_message?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["bulk_recipient_status"]
          student_id?: string
          student_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_message_recipients_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "bulk_message_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          description: string | null
          end_at: string | null
          entity_id: string | null
          entity_type: string | null
          external_event_id: string | null
          external_id: string | null
          external_provider: string | null
          external_source: string
          ia_source: string
          id: string
          last_sync_at: string | null
          location: string | null
          owner: string | null
          participants: Json | null
          start_at: string
          sync_status: string | null
          tags: string[]
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          description?: string | null
          end_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          external_event_id?: string | null
          external_id?: string | null
          external_provider?: string | null
          external_source?: string
          ia_source?: string
          id?: string
          last_sync_at?: string | null
          location?: string | null
          owner?: string | null
          participants?: Json | null
          start_at: string
          sync_status?: string | null
          tags?: string[]
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          description?: string | null
          end_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          external_event_id?: string | null
          external_id?: string | null
          external_provider?: string | null
          external_source?: string
          ia_source?: string
          id?: string
          last_sync_at?: string | null
          location?: string | null
          owner?: string | null
          participants?: Json | null
          start_at?: string
          sync_status?: string | null
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claris_conversations: {
        Row: {
          created_at: string
          id: string
          last_context_route: string | null
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_context_route?: string | null
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_context_route?: string | null
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claris_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claris_suggestion_cooldowns: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          expires_at: string
          id: string
          outcome: string
          set_at: string
          suggestion_id: string | null
          trigger_engine: string
          trigger_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          expires_at: string
          id?: string
          outcome?: string
          set_at?: string
          suggestion_id?: string | null
          trigger_engine: string
          trigger_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string
          id?: string
          outcome?: string
          set_at?: string
          suggestion_id?: string | null
          trigger_engine?: string
          trigger_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claris_suggestion_cooldowns_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "claris_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claris_suggestion_cooldowns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claris_suggestions: {
        Row: {
          acted_at: string | null
          action_payload: Json | null
          action_type: string | null
          analysis: string | null
          body: string
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          expected_impact: string | null
          expires_at: string | null
          id: string
          priority: string
          reason: string | null
          status: string
          suggested_at: string
          title: string
          trigger_context: Json | null
          trigger_engine: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          action_payload?: Json | null
          action_type?: string | null
          analysis?: string | null
          body: string
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          expected_impact?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          reason?: string | null
          status?: string
          suggested_at?: string
          title: string
          trigger_context?: Json | null
          trigger_engine?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acted_at?: string | null
          action_payload?: Json | null
          action_type?: string | null
          analysis?: string | null
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          expected_impact?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          reason?: string | null
          status?: string
          suggested_at?: string
          title?: string
          trigger_context?: Json | null
          trigger_engine?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claris_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string | null
          created_at: string | null
          end_date: string | null
          id: string
          last_sync: string | null
          moodle_course_id: string
          name: string
          short_name: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          last_sync?: string | null
          moodle_course_id: string
          name: string
          short_name?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          last_sync?: string | null
          moodle_course_id?: string
          name?: string
          short_name?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          default_key: string | null
          id: string
          is_default: boolean
          is_favorite: boolean | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          default_key?: string | null
          id?: string
          is_default?: boolean
          is_favorite?: boolean | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          default_key?: string | null
          id?: string
          is_default?: boolean
          is_favorite?: boolean | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      moodle_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          last_message_text: string | null
          moodle_conversation_id: string
          student_id: string
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_text?: string | null
          moodle_conversation_id: string
          student_id: string
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_text?: string | null
          moodle_conversation_id?: string
          student_id?: string
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      moodle_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          moodle_message_id: string
          sender_name: string | null
          sender_type: string
          sent_at: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          moodle_message_id: string
          sender_name?: string | null
          sender_type: string
          sent_at: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          moodle_message_id?: string
          sender_name?: string | null
          sender_type?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodle_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "moodle_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          pending_task_id: string | null
          student_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          pending_task_id?: string | null
          student_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          pending_task_id?: string | null
          student_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_pending_task_id_fkey"
            columns: ["pending_task_id"]
            isOneToOne: false
            referencedRelation: "pending_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_tasks: {
        Row: {
          assigned_to_user_id: string | null
          automation_type:
            | Database["public"]["Enums"]["task_automation_type"]
            | null
          category_name: string | null
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean | null
          moodle_activity_id: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          recurrence_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          student_id: string | null
          task_type: Database["public"]["Enums"]["task_type"] | null
          template_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          automation_type?:
            | Database["public"]["Enums"]["task_automation_type"]
            | null
          category_name?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          moodle_activity_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          recurrence_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          student_id?: string | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          template_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          automation_type?:
            | Database["public"]["Enums"]["task_automation_type"]
            | null
          category_name?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          moodle_activity_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          recurrence_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          student_id?: string | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          template_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pending_tasks_recurrence"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "task_recurrence_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "pending_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_history: {
        Row: {
          created_at: string | null
          id: string
          new_level: Database["public"]["Enums"]["risk_level"]
          notes: string | null
          previous_level: Database["public"]["Enums"]["risk_level"] | null
          reasons: string[] | null
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          new_level: Database["public"]["Enums"]["risk_level"]
          notes?: string | null
          previous_level?: Database["public"]["Enums"]["risk_level"] | null
          reasons?: string[] | null
          student_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          new_level?: Database["public"]["Enums"]["risk_level"]
          notes?: string | null
          previous_level?: Database["public"]["Enums"]["risk_level"] | null
          reasons?: string[] | null
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_activities: {
        Row: {
          activity_name: string
          activity_type: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          grade: number | null
          grade_max: number | null
          graded_at: string | null
          hidden: boolean
          id: string
          is_recovery: boolean
          moodle_activity_id: string
          percentage: number | null
          status: string | null
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          activity_name: string
          activity_type?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          grade?: number | null
          grade_max?: number | null
          graded_at?: string | null
          hidden?: boolean
          id?: string
          is_recovery?: boolean
          moodle_activity_id: string
          percentage?: number | null
          status?: string | null
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          activity_name?: string
          activity_type?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          grade?: number | null
          grade_max?: number | null
          graded_at?: string | null
          hidden?: boolean
          id?: string
          is_recovery?: boolean
          moodle_activity_id?: string
          percentage?: number | null
          status?: string | null
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_activities_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_activities_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_course_grades: {
        Row: {
          course_id: string
          created_at: string
          grade_formatted: string | null
          grade_max: number | null
          grade_percentage: number | null
          grade_raw: number | null
          id: string
          last_sync: string
          letter_grade: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          grade_formatted?: string | null
          grade_max?: number | null
          grade_percentage?: number | null
          grade_raw?: number | null
          id?: string
          last_sync?: string
          letter_grade?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          grade_formatted?: string | null
          grade_max?: number | null
          grade_percentage?: number | null
          grade_raw?: number | null
          id?: string
          last_sync?: string
          letter_grade?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_course_grades_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_course_grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_courses: {
        Row: {
          course_id: string
          created_at: string | null
          enrollment_status: string | null
          id: string
          last_access: string | null
          last_sync: string | null
          student_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          enrollment_status?: string | null
          id?: string
          last_access?: string | null
          last_sync?: string | null
          student_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          enrollment_status?: string | null
          id?: string
          last_access?: string | null
          last_sync?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          current_risk_level: Database["public"]["Enums"]["risk_level"] | null
          email: string | null
          full_name: string
          id: string
          last_access: string | null
          moodle_user_id: string
          risk_reasons: string[] | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          current_risk_level?: Database["public"]["Enums"]["risk_level"] | null
          email?: string | null
          full_name: string
          id?: string
          last_access?: string | null
          moodle_user_id: string
          risk_reasons?: string[] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          current_risk_level?: Database["public"]["Enums"]["risk_level"] | null
          email?: string | null
          full_name?: string
          id?: string
          last_access?: string | null
          moodle_user_id?: string
          risk_reasons?: string[] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          context: Json | null
          created_at: string
          description: string
          id: string
          priority: string
          resolved_at: string | null
          route: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          context?: Json | null
          created_at?: string
          description: string
          id?: string
          priority?: string
          resolved_at?: string | null
          route?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          context?: Json | null
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          route?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrence_configs: {
        Row: {
          course_id: string | null
          created_at: string | null
          created_by_user_id: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          next_generation_at: string | null
          pattern: Database["public"]["Enums"]["recurrence_pattern"]
          priority: Database["public"]["Enums"]["task_priority"] | null
          start_date: string
          student_id: string | null
          task_type: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at: string | null
          weekly_day: number | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          created_by_user_id: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_generation_at?: string | null
          pattern: Database["public"]["Enums"]["recurrence_pattern"]
          priority?: Database["public"]["Enums"]["task_priority"] | null
          start_date: string
          student_id?: string | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at?: string | null
          weekly_day?: number | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          created_by_user_id?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_generation_at?: string | null
          pattern?: Database["public"]["Enums"]["recurrence_pattern"]
          priority?: Database["public"]["Enums"]["task_priority"] | null
          start_date?: string
          student_id?: string | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string
          updated_at?: string | null
          weekly_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrence_configs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_configs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrence_configs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          auto_message_template: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          task_type: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_message_template?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_message_template?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          origin_reason: string | null
          priority: string
          project_id: string | null
          status: string
          suggested_by_ai: boolean
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          origin_reason?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          suggested_by_ai?: boolean
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          origin_reason?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          suggested_by_ai?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_courses: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ignored_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ignored_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ignored_courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sync_preferences: {
        Row: {
          claris_llm_settings: Json
          created_at: string
          enabled_temperatures: Json
          entity_last_sync: Json
          entity_temperatures: Json
          id: string
          include_empty_courses: boolean
          include_finished: boolean
          risk_threshold_days: Json
          selected_keys: string[]
          sync_interval_days: Json
          sync_interval_hours: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          claris_llm_settings?: Json
          created_at?: string
          enabled_temperatures?: Json
          entity_last_sync?: Json
          entity_temperatures?: Json
          id?: string
          include_empty_courses?: boolean
          include_finished?: boolean
          risk_threshold_days?: Json
          selected_keys?: string[]
          sync_interval_days?: Json
          sync_interval_hours?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          claris_llm_settings?: Json
          created_at?: string
          enabled_temperatures?: Json
          entity_last_sync?: Json
          entity_temperatures?: Json
          id?: string
          include_empty_courses?: boolean
          include_finished?: boolean
          risk_threshold_days?: Json
          selected_keys?: string[]
          sync_interval_days?: Json
          sync_interval_hours?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          last_login: string | null
          last_sync: string | null
          message_templates_seeded_at: string | null
          moodle_user_id: string
          moodle_username: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          last_login?: string | null
          last_sync?: string | null
          message_templates_seeded_at?: string | null
          moodle_user_id: string
          moodle_username: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_login?: string | null
          last_sync?: string | null
          message_templates_seeded_at?: string | null
          moodle_user_id?: string
          moodle_username?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_recurrence_date: {
        Args: {
          current_ts: string
          pattern: Database["public"]["Enums"]["recurrence_pattern"]
        }
        Returns: string
      }
      calculate_student_risk: {
        Args: { p_student_id: string }
        Returns: {
          risk_level: Database["public"]["Enums"]["risk_level"]
          risk_reasons: string[]
        }[]
      }
      is_application_admin: { Args: never; Returns: boolean }
      resolve_current_app_user_id: { Args: never; Returns: string }
      update_course_students_risk: {
        Args: { p_course_id: string }
        Returns: number
      }
      update_student_risk: {
        Args: { p_student_id: string }
        Returns: undefined
      }
      user_has_course_access: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_student_access: {
        Args: { p_student_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      bulk_message_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      bulk_recipient_status: "pending" | "sent" | "failed"
      recurrence_pattern:
        | "diario"
        | "semanal"
        | "quinzenal"
        | "mensal"
        | "bimestral"
        | "trimestral"
      risk_level: "normal" | "atencao" | "risco" | "critico" | "inativo"
      task_automation_type:
        | "manual"
        | "auto_at_risk"
        | "auto_missed_assignment"
        | "auto_uncorrected_activity"
        | "recurring"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status: "aberta" | "em_andamento" | "resolvida"
      task_type: "moodle" | "interna"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      bulk_message_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      bulk_recipient_status: ["pending", "sent", "failed"],
      recurrence_pattern: [
        "diario",
        "semanal",
        "quinzenal",
        "mensal",
        "bimestral",
        "trimestral",
      ],
      risk_level: ["normal", "atencao", "risco", "critico", "inativo"],
      task_automation_type: [
        "manual",
        "auto_at_risk",
        "auto_missed_assignment",
        "auto_uncorrected_activity",
        "recurring",
      ],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: ["aberta", "em_andamento", "resolvida"],
      task_type: ["moodle", "interna"],
    },
  },
} as const

