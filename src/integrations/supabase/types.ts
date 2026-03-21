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
      comunicacoes: {
        Row: {
          assunto: string | null
          conteudo: string | null
          criado_em: string
          direcao: string
          id: string
          lead_id: string
          status: string
          tipo: string
        }
        Insert: {
          assunto?: string | null
          conteudo?: string | null
          criado_em?: string
          direcao: string
          id?: string
          lead_id: string
          status?: string
          tipo: string
        }
        Update: {
          assunto?: string | null
          conteudo?: string | null
          criado_em?: string
          direcao?: string
          id?: string
          lead_id?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_templates: {
        Row: {
          ativo: boolean | null
          conteudo_template: string
          created_at: string | null
          id: string
          nome: string
          placeholders: Json | null
          tipo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          conteudo_template: string
          created_at?: string | null
          id?: string
          nome: string
          placeholders?: Json | null
          tipo: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          conteudo_template?: string
          created_at?: string | null
          id?: string
          nome?: string
          placeholders?: Json | null
          tipo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          atualizado_em: string
          cliente_email: string | null
          cliente_nome: string
          cliente_telefone: string | null
          criado_em: string
          id: string
          pdf_url: string | null
          status: string
          tipo_servico: string
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          cliente_email?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          criado_em?: string
          id?: string
          pdf_url?: string | null
          status?: string
          tipo_servico?: string
          valor_total?: number
        }
        Update: {
          atualizado_em?: string
          cliente_email?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          criado_em?: string
          id?: string
          pdf_url?: string | null
          status?: string
          tipo_servico?: string
          valor_total?: number
        }
        Relationships: []
      }
      contratos_gerados: {
        Row: {
          chat_historico: Json | null
          cnpj_cpf: string | null
          conteudo_final: string
          created_at: string | null
          dados_preenchidos: Json
          email_cliente: string | null
          endereco: string | null
          id: string
          lead_id: string | null
          nome_cliente: string
          numero_parcelas: number | null
          status: string | null
          telefone_cliente: string | null
          template_id: string | null
          tipo_pagamento: string | null
          updated_at: string | null
          user_id: string
          valor_recorrente: number | null
          valor_total: number | null
        }
        Insert: {
          chat_historico?: Json | null
          cnpj_cpf?: string | null
          conteudo_final: string
          created_at?: string | null
          dados_preenchidos?: Json
          email_cliente?: string | null
          endereco?: string | null
          id?: string
          lead_id?: string | null
          nome_cliente: string
          numero_parcelas?: number | null
          status?: string | null
          telefone_cliente?: string | null
          template_id?: string | null
          tipo_pagamento?: string | null
          updated_at?: string | null
          user_id: string
          valor_recorrente?: number | null
          valor_total?: number | null
        }
        Update: {
          chat_historico?: Json | null
          cnpj_cpf?: string | null
          conteudo_final?: string
          created_at?: string | null
          dados_preenchidos?: Json
          email_cliente?: string | null
          endereco?: string | null
          id?: string
          lead_id?: string | null
          nome_cliente?: string
          numero_parcelas?: number | null
          status?: string | null
          telefone_cliente?: string | null
          template_id?: string | null
          tipo_pagamento?: string | null
          updated_at?: string | null
          user_id?: string
          valor_recorrente?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_gerados_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_gerados_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contrato_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          escopo: string
          expira_em: string | null
          id: string
          nome: string
          notas: string | null
          servico: string
          tipo: string
          ultimo_uso: string | null
          updated_at: string | null
          url_servico: string | null
          user_id: string
          valor: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          escopo?: string
          expira_em?: string | null
          id?: string
          nome: string
          notas?: string | null
          servico: string
          tipo?: string
          ultimo_uso?: string | null
          updated_at?: string | null
          url_servico?: string | null
          user_id: string
          valor: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          escopo?: string
          expira_em?: string | null
          id?: string
          nome?: string
          notas?: string | null
          servico?: string
          tipo?: string
          ultimo_uso?: string | null
          updated_at?: string | null
          url_servico?: string | null
          user_id?: string
          valor?: string
        }
        Relationships: []
      }
      custos: {
        Row: {
          ativo: boolean
          categoria: string
          criado_em: string
          data_renovacao: string | null
          escopo: string | null
          id: string
          nome: string
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          criado_em?: string
          data_renovacao?: string | null
          escopo?: string | null
          id?: string
          nome: string
          valor_mensal: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          criado_em?: string
          data_renovacao?: string | null
          escopo?: string | null
          id?: string
          nome?: string
          valor_mensal?: number
        }
        Relationships: []
      }
      email_contatos: {
        Row: {
          aberto_em: string | null
          cargo: string | null
          created_at: string | null
          dados_extras: Json | null
          email: string
          email_assunto: string | null
          email_gerado: string | null
          empresa: string | null
          enviado_em: string | null
          id: string
          lista_id: string | null
          nome: string | null
          resend_message_id: string | null
          respondido_em: string | null
          status_envio: string | null
          telefone: string | null
          user_id: string
        }
        Insert: {
          aberto_em?: string | null
          cargo?: string | null
          created_at?: string | null
          dados_extras?: Json | null
          email: string
          email_assunto?: string | null
          email_gerado?: string | null
          empresa?: string | null
          enviado_em?: string | null
          id?: string
          lista_id?: string | null
          nome?: string | null
          resend_message_id?: string | null
          respondido_em?: string | null
          status_envio?: string | null
          telefone?: string | null
          user_id: string
        }
        Update: {
          aberto_em?: string | null
          cargo?: string | null
          created_at?: string | null
          dados_extras?: Json | null
          email?: string
          email_assunto?: string | null
          email_gerado?: string | null
          empresa?: string | null
          enviado_em?: string | null
          id?: string
          lista_id?: string | null
          nome?: string | null
          resend_message_id?: string | null
          respondido_em?: string | null
          status_envio?: string | null
          telefone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contatos_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      email_lists: {
        Row: {
          arquivo_origem: string | null
          created_at: string | null
          descricao: string | null
          emails_abertos: number | null
          emails_enviados: number | null
          emails_respondidos: number | null
          id: string
          nicho: string
          nome: string
          status: string | null
          total_emails: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          arquivo_origem?: string | null
          created_at?: string | null
          descricao?: string | null
          emails_abertos?: number | null
          emails_enviados?: number | null
          emails_respondidos?: number | null
          id?: string
          nicho: string
          nome: string
          status?: string | null
          total_emails?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          arquivo_origem?: string | null
          created_at?: string | null
          descricao?: string | null
          emails_abertos?: number | null
          emails_enviados?: number | null
          emails_respondidos?: number | null
          id?: string
          nicho?: string
          nome?: string
          status?: string | null
          total_emails?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_templates_nicho: {
        Row: {
          assunto_base: string | null
          ativo: boolean | null
          created_at: string | null
          exemplo_email: string | null
          id: string
          nicho: string
          nome: string
          prompt_ia: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assunto_base?: string | null
          ativo?: boolean | null
          created_at?: string | null
          exemplo_email?: string | null
          id?: string
          nicho: string
          nome: string
          prompt_ia: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assunto_base?: string | null
          ativo?: boolean | null
          created_at?: string | null
          exemplo_email?: string | null
          id?: string
          nicho?: string
          nome?: string
          prompt_ia?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          data_email_enviado: string | null
          data_email_respondido: string | null
          data_reuniao: string | null
          data_whatsapp_enviado: string | null
          data_whatsapp_respondido: string | null
          dores_identificadas: string | null
          email: string
          email_enviado: boolean | null
          email_respondido: boolean | null
          empresa: string | null
          id: string
          instagram_url: string | null
          linkedin_cargo: string | null
          linkedin_url: string | null
          mensagem_original: string | null
          motivo_score: string | null
          nivel_maturidade_digital: string | null
          nome: string
          oportunidades: string | null
          origem: string | null
          origem_metadata: Json | null
          porte_empresa: string | null
          prioridade_contato: string | null
          resumo_empresa: string | null
          reuniao_agendada: boolean | null
          score: number | null
          segmento: string | null
          site_descricao: string | null
          site_empresa: string | null
          site_titulo: string | null
          status: string | null
          telefone: string | null
          whatsapp_enviado: boolean | null
          whatsapp_respondido: boolean | null
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          data_email_enviado?: string | null
          data_email_respondido?: string | null
          data_reuniao?: string | null
          data_whatsapp_enviado?: string | null
          data_whatsapp_respondido?: string | null
          dores_identificadas?: string | null
          email: string
          email_enviado?: boolean | null
          email_respondido?: boolean | null
          empresa?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_cargo?: string | null
          linkedin_url?: string | null
          mensagem_original?: string | null
          motivo_score?: string | null
          nivel_maturidade_digital?: string | null
          nome: string
          oportunidades?: string | null
          origem?: string | null
          origem_metadata?: Json | null
          porte_empresa?: string | null
          prioridade_contato?: string | null
          resumo_empresa?: string | null
          reuniao_agendada?: boolean | null
          score?: number | null
          segmento?: string | null
          site_descricao?: string | null
          site_empresa?: string | null
          site_titulo?: string | null
          status?: string | null
          telefone?: string | null
          whatsapp_enviado?: boolean | null
          whatsapp_respondido?: boolean | null
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          data_email_enviado?: string | null
          data_email_respondido?: string | null
          data_reuniao?: string | null
          data_whatsapp_enviado?: string | null
          data_whatsapp_respondido?: string | null
          dores_identificadas?: string | null
          email?: string
          email_enviado?: boolean | null
          email_respondido?: boolean | null
          empresa?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_cargo?: string | null
          linkedin_url?: string | null
          mensagem_original?: string | null
          motivo_score?: string | null
          nivel_maturidade_digital?: string | null
          nome?: string
          oportunidades?: string | null
          origem?: string | null
          origem_metadata?: Json | null
          porte_empresa?: string | null
          prioridade_contato?: string | null
          resumo_empresa?: string | null
          reuniao_agendada?: boolean | null
          score?: number | null
          segmento?: string | null
          site_descricao?: string | null
          site_empresa?: string | null
          site_titulo?: string | null
          status?: string | null
          telefone?: string | null
          whatsapp_enviado?: boolean | null
          whatsapp_respondido?: boolean | null
        }
        Relationships: []
      }
      metas_financeiras: {
        Row: {
          created_at: string | null
          id: string
          tipo: string
          updated_at: string | null
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          tipo: string
          updated_at?: string | null
          user_id: string
          valor?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          tipo?: string
          updated_at?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          lida: boolean | null
          link: string | null
          metadata: Json | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          metadata?: Json | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          metadata?: Json | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      parcelas: {
        Row: {
          contrato_id: string
          criado_em: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string | null
          id: string
          notificacao_enviada: boolean
          status: string
          valor: number
        }
        Insert: {
          contrato_id: string
          criado_em?: string
          data_pagamento?: string | null
          data_vencimento: string
          descricao?: string | null
          id?: string
          notificacao_enviada?: boolean
          status?: string
          valor: number
        }
        Update: {
          contrato_id?: string
          criado_em?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string | null
          id?: string
          notificacao_enviada?: boolean
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      recorrencias: {
        Row: {
          ativo: boolean
          contrato_id: string
          criado_em: string
          dia_vencimento: number
          id: string
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          contrato_id: string
          criado_em?: string
          dia_vencimento?: number
          id?: string
          valor_mensal: number
        }
        Update: {
          ativo?: boolean
          contrato_id?: string
          criado_em?: string
          dia_vencimento?: number
          id?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          atualizado_em: string
          concluida: boolean
          contrato_id: string | null
          criado_em: string
          data_vencimento: string | null
          descricao: string | null
          id: string
          lead_id: string | null
          prioridade: string
          status: string
          titulo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          concluida?: boolean
          contrato_id?: string | null
          criado_em?: string
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          prioridade?: string
          status?: string
          titulo: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          concluida?: boolean
          contrato_id?: string | null
          criado_em?: string
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          prioridade?: string
          status?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes_pessoais: {
        Row: {
          categoria: string
          comprovante_url: string | null
          created_at: string | null
          data: string
          descricao: string
          dia_recorrencia: number | null
          id: string
          metodo_pagamento: string | null
          recorrente: boolean | null
          tags: Json | null
          tipo: string
          updated_at: string | null
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          comprovante_url?: string | null
          created_at?: string | null
          data: string
          descricao: string
          dia_recorrencia?: number | null
          id?: string
          metodo_pagamento?: string | null
          recorrente?: boolean | null
          tags?: Json | null
          tipo: string
          updated_at?: string | null
          user_id: string
          valor: number
        }
        Update: {
          categoria?: string
          comprovante_url?: string | null
          created_at?: string | null
          data?: string
          descricao?: string
          dia_recorrencia?: number | null
          id?: string
          metodo_pagamento?: string | null
          recorrente?: boolean | null
          tags?: Json | null
          tipo?: string
          updated_at?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      lead_notas: {
        Row: {
          id: string
          lead_id: string
          user_id: string
          conteudo: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          user_id: string
          conteudo: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          user_id?: string
          conteudo?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      automacoes_estagio: {
        Row: {
          id: string
          user_id: string
          estagio: string
          ativo: boolean | null
          criar_tarefa: boolean | null
          tarefa_titulo: string | null
          tarefa_descricao: string | null
          tarefa_prazo_dias: number | null
          tarefa_prioridade: string | null
          criar_notificacao: boolean | null
          notificacao_titulo: string | null
          notificacao_descricao: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          estagio: string
          ativo?: boolean | null
          criar_tarefa?: boolean | null
          tarefa_titulo?: string | null
          tarefa_descricao?: string | null
          tarefa_prazo_dias?: number | null
          tarefa_prioridade?: string | null
          criar_notificacao?: boolean | null
          notificacao_titulo?: string | null
          notificacao_descricao?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          estagio?: string
          ativo?: boolean | null
          criar_tarefa?: boolean | null
          tarefa_titulo?: string | null
          tarefa_descricao?: string | null
          tarefa_prazo_dias?: number | null
          tarefa_prioridade?: string | null
          criar_notificacao?: boolean | null
          notificacao_titulo?: string | null
          notificacao_descricao?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      propostas: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          titulo: string
          tipo_servico: string
          contexto_cliente: string
          conteudo_gerado: string | null
          valor_estimado: number | null
          validade_dias: number | null
          status: string
          enviada_em: string | null
          versao: number | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id?: string | null
          titulo: string
          tipo_servico: string
          contexto_cliente: string
          conteudo_gerado?: string | null
          valor_estimado?: number | null
          validade_dias?: number | null
          status?: string
          enviada_em?: string | null
          versao?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          titulo?: string
          tipo_servico?: string
          contexto_cliente?: string
          conteudo_gerado?: string | null
          valor_estimado?: number | null
          validade_dias?: number | null
          status?: string
          enviada_em?: string | null
          versao?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reunioes: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          titulo: string
          descricao: string | null
          data_hora_inicio: string
          data_hora_fim: string | null
          link_videoconferencia: string | null
          local: string | null
          status: string
          notificacao_1h_enviada: boolean | null
          notificacao_dia_enviada: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id?: string | null
          titulo: string
          descricao?: string | null
          data_hora_inicio: string
          data_hora_fim?: string | null
          link_videoconferencia?: string | null
          local?: string | null
          status?: string
          notificacao_1h_enviada?: boolean | null
          notificacao_dia_enviada?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          titulo?: string
          descricao?: string | null
          data_hora_inicio?: string
          data_hora_fim?: string | null
          link_videoconferencia?: string | null
          local?: string | null
          status?: string
          notificacao_1h_enviada?: boolean | null
          notificacao_dia_enviada?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      resend_eventos: {
        Row: {
          id: string
          resend_message_id: string
          tipo: string
          payload: Json | null
          processado_em: string
        }
        Insert: {
          id?: string
          resend_message_id: string
          tipo: string
          payload?: Json | null
          processado_em?: string
        }
        Update: {
          id?: string
          resend_message_id?: string
          tipo?: string
          payload?: Json | null
          processado_em?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
