export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      actions: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type"]
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          description: string
          id: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["action_status"] | null
          student_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["action_type"]
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["action_status"] | null
          student_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["action_type"]
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["action_status"] | null
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
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          due_date: string | null
          id: string
          moodle_activity_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          status: Database["public"]["Enums"]["task_status"] | null
          student_id: string
          task_type: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          moodle_activity_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
          student_id: string
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          moodle_activity_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
          student_id?: string
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
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
            foreignKeyName: "pending_tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          hidden: boolean
          id: string
          moodle_activity_id: string
          percentage: number | null
          status: string | null
          student_id: string
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
          hidden?: boolean
          id?: string
          moodle_activity_id: string
          percentage?: number | null
          status?: string | null
          student_id: string
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
          hidden?: boolean
          id?: string
          moodle_activity_id?: string
          percentage?: number | null
          status?: string | null
          student_id?: string
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
          last_sync: string | null
          student_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          enrollment_status?: string | null
          id?: string
          last_sync?: string | null
          student_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          enrollment_status?: string | null
          id?: string
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
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          last_login: string | null
          last_sync: string | null
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
      calculate_student_risk: {
        Args: { p_student_id: string }
        Returns: {
          risk_level: Database["public"]["Enums"]["risk_level"]
          risk_reasons: string[]
        }[]
      }
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
      action_status: "planejada" | "concluida"
      action_type:
        | "contato"
        | "orientacao"
        | "cobranca"
        | "suporte_tecnico"
        | "reuniao"
        | "outro"
      risk_level: "normal" | "atencao" | "risco" | "critico"
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
      action_status: ["planejada", "concluida"],
      action_type: [
        "contato",
        "orientacao",
        "cobranca",
        "suporte_tecnico",
        "reuniao",
        "outro",
      ],
      risk_level: ["normal", "atencao", "risco", "critico"],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: ["aberta", "em_andamento", "resolvida"],
      task_type: ["moodle", "interna"],
    },
  },
} as const
