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
      analise_lead_ia: {
        Row: {
          acoes_sugeridas: string | null
          aplicado: boolean | null
          confianca: number
          created_at: string | null
          estagio_anterior: string | null
          estagio_sugerido: string
          id: string
          lead_id: string
          mensagens_analisadas: number | null
          motivo: string
          user_id: string
        }
        Insert: {
          acoes_sugeridas?: string | null
          aplicado?: boolean | null
          confianca: number
          created_at?: string | null
          estagio_anterior?: string | null
          estagio_sugerido: string
          id?: string
          lead_id: string
          mensagens_analisadas?: number | null
          motivo: string
          user_id: string
        }
        Update: {
          acoes_sugeridas?: string | null
          aplicado?: boolean | null
          confianca?: number
          created_at?: string | null
          estagio_anterior?: string | null
          estagio_sugerido?: string
          id?: string
          lead_id?: string
          mensagens_analisadas?: number | null
          motivo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analise_lead_ia_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      automacoes_estagio: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          criar_notificacao: boolean | null
          criar_tarefa: boolean | null
          estagio: string
          id: string
          notificacao_descricao: string | null
          notificacao_titulo: string | null
          tarefa_descricao: string | null
          tarefa_prazo_dias: number | null
          tarefa_prioridade: string | null
          tarefa_titulo: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          criar_notificacao?: boolean | null
          criar_tarefa?: boolean | null
          estagio: string
          id?: string
          notificacao_descricao?: string | null
          notificacao_titulo?: string | null
          tarefa_descricao?: string | null
          tarefa_prazo_dias?: number | null
          tarefa_prioridade?: string | null
          tarefa_titulo?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          criar_notificacao?: boolean | null
          criar_tarefa?: boolean | null
          estagio?: string
          id?: string
          notificacao_descricao?: string | null
          notificacao_titulo?: string | null
          tarefa_descricao?: string | null
          tarefa_prazo_dias?: number | null
          tarefa_prioridade?: string | null
          tarefa_titulo?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comunicacoes: {
        Row: {
          aberto_em: string | null
          assunto: string | null
          clicado_em: string | null
          conteudo: string | null
          criado_em: string
          direcao: string
          id: string
          lead_id: string
          resend_message_id: string | null
          status: string
          tipo: string
        }
        Insert: {
          aberto_em?: string | null
          assunto?: string | null
          clicado_em?: string | null
          conteudo?: string | null
          criado_em?: string
          direcao: string
          id?: string
          lead_id: string
          resend_message_id?: string | null
          status?: string
          tipo: string
        }
        Update: {
          aberto_em?: string | null
          assunto?: string | null
          clicado_em?: string | null
          conteudo?: string | null
          criado_em?: string
          direcao?: string
          id?: string
          lead_id?: string
          resend_message_id?: string | null
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
      contratos_modelos: {
        Row: {
          conteudo: string | null
          created_at: string | null
          id: string
          nome: string
          tipo: string | null
          user_id: string | null
        }
        Insert: {
          conteudo?: string | null
          created_at?: string | null
          id?: string
          nome: string
          tipo?: string | null
          user_id?: string | null
        }
        Update: {
          conteudo?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contratos_preenchidos: {
        Row: {
          conteudo_final: string | null
          created_at: string | null
          id: string
          modelo_id: string | null
          nome_cliente: string | null
          user_id: string | null
        }
        Insert: {
          conteudo_final?: string | null
          created_at?: string | null
          id?: string
          modelo_id?: string | null
          nome_cliente?: string | null
          user_id?: string | null
        }
        Update: {
          conteudo_final?: string | null
          created_at?: string | null
          id?: string
          modelo_id?: string | null
          nome_cliente?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_preenchidos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "contratos_modelos"
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
      extracoes: {
        Row: {
          apify_run_id: string | null
          cidade: string
          criado_em: string | null
          erro_mensagem: string | null
          id: string
          leads_ids: string[] | null
          nicho: string
          quantidade_extraida: number | null
          quantidade_solicitada: number
          status: string | null
          user_id: string | null
        }
        Insert: {
          apify_run_id?: string | null
          cidade: string
          criado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          leads_ids?: string[] | null
          nicho: string
          quantidade_extraida?: number | null
          quantidade_solicitada: number
          status?: string | null
          user_id?: string | null
        }
        Update: {
          apify_run_id?: string | null
          cidade?: string
          criado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          leads_ids?: string[] | null
          nicho?: string
          quantidade_extraida?: number | null
          quantidade_solicitada?: number
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      lead_notas: {
        Row: {
          conteudo: string
          created_at: string | null
          id: string
          lead_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conteudo: string
          created_at?: string | null
          id?: string
          lead_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
          email: string | null
          email_enviado: boolean | null
          email_respondido: boolean | null
          empresa: string | null
          enriquecimento_data: string | null
          enriquecimento_fontes: Json | null
          enriquecimento_instagram_raw: Json | null
          enriquecimento_linkedin_raw: Json | null
          enriquecimento_site_raw: Json | null
          estagio_fonte: string | null
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
          score_calculado_em: string | null
          segmento: string | null
          site_descricao: string | null
          site_empresa: string | null
          site_titulo: string | null
          status: string | null
          status_mudou_em: string | null
          telefone: string | null
          total_mensagens_whatsapp: number | null
          ultima_mensagem_whatsapp: string | null
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
          email?: string | null
          email_enviado?: boolean | null
          email_respondido?: boolean | null
          empresa?: string | null
          enriquecimento_data?: string | null
          enriquecimento_fontes?: Json | null
          enriquecimento_instagram_raw?: Json | null
          enriquecimento_linkedin_raw?: Json | null
          enriquecimento_site_raw?: Json | null
          estagio_fonte?: string | null
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
          score_calculado_em?: string | null
          segmento?: string | null
          site_descricao?: string | null
          site_empresa?: string | null
          site_titulo?: string | null
          status?: string | null
          status_mudou_em?: string | null
          telefone?: string | null
          total_mensagens_whatsapp?: number | null
          ultima_mensagem_whatsapp?: string | null
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
          email?: string | null
          email_enviado?: boolean | null
          email_respondido?: boolean | null
          empresa?: string | null
          enriquecimento_data?: string | null
          enriquecimento_fontes?: Json | null
          enriquecimento_instagram_raw?: Json | null
          enriquecimento_linkedin_raw?: Json | null
          enriquecimento_site_raw?: Json | null
          estagio_fonte?: string | null
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
          score_calculado_em?: string | null
          segmento?: string | null
          site_descricao?: string | null
          site_empresa?: string | null
          site_titulo?: string | null
          status?: string | null
          status_mudou_em?: string | null
          telefone?: string | null
          total_mensagens_whatsapp?: number | null
          ultima_mensagem_whatsapp?: string | null
          whatsapp_enviado?: boolean | null
          whatsapp_respondido?: boolean | null
        }
        Relationships: []
      }
      licoes_aprendidas: {
        Row: {
          atualizada_em: string
          contexto: string
          criada_em: string
          dominio: string
          evidencia: string | null
          id: string
          licao: string
          reincidencias: number
          status: string
        }
        Insert: {
          atualizada_em?: string
          contexto: string
          criada_em?: string
          dominio: string
          evidencia?: string | null
          id?: string
          licao: string
          reincidencias?: number
          status?: string
        }
        Update: {
          atualizada_em?: string
          contexto?: string
          criada_em?: string
          dominio?: string
          evidencia?: string | null
          id?: string
          licao?: string
          reincidencias?: number
          status?: string
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
      perfil_prestador: {
        Row: {
          cidade_uf: string | null
          cpf_cnpj: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string
          nome_completo: string | null
          nome_empresa: string | null
          telefone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cidade_uf?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome_completo?: string | null
          nome_empresa?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cidade_uf?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome_completo?: string | null
          nome_empresa?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      propostas: {
        Row: {
          conteudo_gerado: string | null
          contexto_cliente: string
          created_at: string | null
          enviada_em: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          status: string | null
          tipo_servico: string
          titulo: string
          updated_at: string | null
          user_id: string
          validade_dias: number | null
          valor_estimado: number | null
          versao: number | null
        }
        Insert: {
          conteudo_gerado?: string | null
          contexto_cliente: string
          created_at?: string | null
          enviada_em?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          status?: string | null
          tipo_servico: string
          titulo: string
          updated_at?: string | null
          user_id: string
          validade_dias?: number | null
          valor_estimado?: number | null
          versao?: number | null
        }
        Update: {
          conteudo_gerado?: string | null
          contexto_cliente?: string
          created_at?: string | null
          enviada_em?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          status?: string | null
          tipo_servico?: string
          titulo?: string
          updated_at?: string | null
          user_id?: string
          validade_dias?: number | null
          valor_estimado?: number | null
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      relatorios_semanais: {
        Row: {
          analise_funcionou: string
          analise_nao_funcionou: string
          created_at: string | null
          id: string
          leads_destaque: Json | null
          metadata: Json | null
          previsao_proxima_semana: string
          relatorio_completo: string
          resumo_executivo: string
          semana_fim: string
          semana_inicio: string
          sugestoes_melhoria: string
          taxa_conversao: number | null
          total_avancaram: number | null
          total_leads_abordados: number | null
          total_perdidos: number | null
          user_id: string
        }
        Insert: {
          analise_funcionou?: string
          analise_nao_funcionou?: string
          created_at?: string | null
          id?: string
          leads_destaque?: Json | null
          metadata?: Json | null
          previsao_proxima_semana?: string
          relatorio_completo: string
          resumo_executivo: string
          semana_fim: string
          semana_inicio: string
          sugestoes_melhoria?: string
          taxa_conversao?: number | null
          total_avancaram?: number | null
          total_leads_abordados?: number | null
          total_perdidos?: number | null
          user_id: string
        }
        Update: {
          analise_funcionou?: string
          analise_nao_funcionou?: string
          created_at?: string | null
          id?: string
          leads_destaque?: Json | null
          metadata?: Json | null
          previsao_proxima_semana?: string
          relatorio_completo?: string
          resumo_executivo?: string
          semana_fim?: string
          semana_inicio?: string
          sugestoes_melhoria?: string
          taxa_conversao?: number | null
          total_avancaram?: number | null
          total_leads_abordados?: number | null
          total_perdidos?: number | null
          user_id?: string
        }
        Relationships: []
      }
      resend_eventos: {
        Row: {
          id: string
          payload: Json | null
          processado_em: string | null
          resend_message_id: string
          tipo: string
        }
        Insert: {
          id?: string
          payload?: Json | null
          processado_em?: string | null
          resend_message_id: string
          tipo: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processado_em?: string | null
          resend_message_id?: string
          tipo?: string
        }
        Relationships: []
      }
      reunioes: {
        Row: {
          created_at: string | null
          data_hora_fim: string | null
          data_hora_inicio: string
          descricao: string | null
          id: string
          lead_id: string | null
          link_videoconferencia: string | null
          local: string | null
          notificacao_1h_enviada: boolean | null
          notificacao_dia_enviada: boolean | null
          status: string | null
          titulo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_hora_fim?: string | null
          data_hora_inicio: string
          descricao?: string | null
          id?: string
          lead_id?: string | null
          link_videoconferencia?: string | null
          local?: string | null
          notificacao_1h_enviada?: boolean | null
          notificacao_dia_enviada?: boolean | null
          status?: string | null
          titulo: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_hora_fim?: string | null
          data_hora_inicio?: string
          descricao?: string | null
          id?: string
          lead_id?: string | null
          link_videoconferencia?: string | null
          local?: string | null
          notificacao_1h_enviada?: boolean | null
          notificacao_dia_enviada?: boolean | null
          status?: string | null
          titulo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reunioes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      wa_analises: {
        Row: {
          abertura_tipo: string | null
          analisado_em: string
          angulo: string | null
          conversa_id: string
          id: string
          o_que_falhou: string | null
          o_que_funcionou: string | null
          objecoes: string[] | null
          resultado: string | null
        }
        Insert: {
          abertura_tipo?: string | null
          analisado_em?: string
          angulo?: string | null
          conversa_id: string
          id?: string
          o_que_falhou?: string | null
          o_que_funcionou?: string | null
          objecoes?: string[] | null
          resultado?: string | null
        }
        Update: {
          abertura_tipo?: string | null
          analisado_em?: string
          angulo?: string | null
          conversa_id?: string
          id?: string
          o_que_falhou?: string | null
          o_que_funcionou?: string | null
          objecoes?: string[] | null
          resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_analises_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "wa_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversas: {
        Row: {
          analisada_em: string | null
          chat_id: string
          criado_em: string
          estagio_analisado_ate: string | null
          id: string
          lead_id: string | null
          nome_contato: string | null
          primeira_msg_em: string | null
          respondeu: boolean
          resultado: string | null
          telefone: string | null
          total_mensagens: number
          ultima_msg_em: string | null
        }
        Insert: {
          analisada_em?: string | null
          chat_id: string
          criado_em?: string
          estagio_analisado_ate?: string | null
          id?: string
          lead_id?: string | null
          nome_contato?: string | null
          primeira_msg_em?: string | null
          respondeu?: boolean
          resultado?: string | null
          telefone?: string | null
          total_mensagens?: number
          ultima_msg_em?: string | null
        }
        Update: {
          analisada_em?: string | null
          chat_id?: string
          criado_em?: string
          estagio_analisado_ate?: string | null
          id?: string
          lead_id?: string | null
          nome_contato?: string | null
          primeira_msg_em?: string | null
          respondeu?: boolean
          resultado?: string | null
          telefone?: string | null
          total_mensagens?: number
          ultima_msg_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_eventos_brutos: {
        Row: {
          erro: string | null
          id: number
          payload: Json
          processado: boolean
          processado_em: string | null
          recebido_em: string
        }
        Insert: {
          erro?: string | null
          id?: number
          payload: Json
          processado?: boolean
          processado_em?: string | null
          recebido_em?: string
        }
        Update: {
          erro?: string | null
          id?: number
          payload?: Json
          processado?: boolean
          processado_em?: string | null
          recebido_em?: string
        }
        Relationships: []
      }
      wa_ignorados: {
        Row: {
          criado_em: string
          motivo: string | null
          telefone: string
        }
        Insert: {
          criado_em?: string
          motivo?: string | null
          telefone: string
        }
        Update: {
          criado_em?: string
          motivo?: string | null
          telefone?: string
        }
        Relationships: []
      }
      wa_mensagens: {
        Row: {
          conteudo: string | null
          conversa_id: string
          criado_em: string
          enviada_em: string
          from_me: boolean
          id: string
          message_id: string
          tipo: string
        }
        Insert: {
          conteudo?: string | null
          conversa_id: string
          criado_em?: string
          enviada_em: string
          from_me: boolean
          id?: string
          message_id: string
          tipo?: string
        }
        Update: {
          conteudo?: string | null
          conversa_id?: string
          criado_em?: string
          enviada_em?: string
          from_me?: boolean
          id?: string
          message_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "wa_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          created_at: string | null
          id: string
          phone_number_id: string | null
          status: string | null
          ultimo_sync: string | null
          updated_at: string | null
          user_id: string
          verify_token: string | null
          waba_id: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          phone_number_id?: string | null
          status?: string | null
          ultimo_sync?: string | null
          updated_at?: string | null
          user_id: string
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          phone_number_id?: string | null
          status?: string | null
          ultimo_sync?: string | null
          updated_at?: string | null
          user_id?: string
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      whatsapp_mensagens: {
        Row: {
          analisado: boolean | null
          conteudo: string | null
          created_at: string | null
          direcao: string
          id: string
          lead_id: string | null
          media_url: string | null
          metadata: Json | null
          status_entrega: string | null
          telefone_destinatario: string
          telefone_remetente: string
          timestamp_whatsapp: string
          tipo_mensagem: string | null
          user_id: string
          wamid: string | null
        }
        Insert: {
          analisado?: boolean | null
          conteudo?: string | null
          created_at?: string | null
          direcao: string
          id?: string
          lead_id?: string | null
          media_url?: string | null
          metadata?: Json | null
          status_entrega?: string | null
          telefone_destinatario: string
          telefone_remetente: string
          timestamp_whatsapp: string
          tipo_mensagem?: string | null
          user_id: string
          wamid?: string | null
        }
        Update: {
          analisado?: boolean | null
          conteudo?: string | null
          created_at?: string | null
          direcao?: string
          id?: string
          lead_id?: string | null
          media_url?: string | null
          metadata?: Json | null
          status_entrega?: string | null
          telefone_destinatario?: string
          telefone_remetente?: string
          timestamp_whatsapp?: string
          tipo_mensagem?: string | null
          user_id?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owner_id: { Args: never; Returns: string }
      registrar_licao: {
        Args: {
          p_contexto: string
          p_dominio: string
          p_evidencia: string
          p_licao: string
        }
        Returns: undefined
      }
      system_health: { Args: never; Returns: Json }
      wa_conversas_para_analise: {
        Args: { p_limite?: number }
        Returns: {
          analisada_em: string | null
          chat_id: string
          criado_em: string
          estagio_analisado_ate: string | null
          id: string
          lead_id: string | null
          nome_contato: string | null
          primeira_msg_em: string | null
          respondeu: boolean
          resultado: string | null
          telefone: string | null
          total_mensagens: number
          ultima_msg_em: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_conversas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      wa_conversas_para_estagio: {
        Args: { p_limite?: number }
        Returns: {
          analisada_em: string | null
          chat_id: string
          criado_em: string
          estagio_analisado_ate: string | null
          id: string
          lead_id: string | null
          nome_contato: string | null
          primeira_msg_em: string | null
          respondeu: boolean
          resultado: string | null
          telefone: string | null
          total_mensagens: number
          ultima_msg_em: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_conversas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      wa_processar_eventos: { Args: never; Returns: undefined }
      wa_sincronizar_lead: {
        Args: { p_conversa_id: string }
        Returns: undefined
      }
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
