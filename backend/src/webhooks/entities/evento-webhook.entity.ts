import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { ContaGateway } from '../../contas-gateway/entities/conta-gateway.entity';

export enum TipoEventoWebhook {
  PAGAMENTO_PIX = 'PAGAMENTO_PIX',
  PAGAMENTO_CARTAO = 'PAGAMENTO_CARTAO',
  SAQUE = 'SAQUE',
}

export enum EstadoProcessamentoWebhook {
  PENDENTE = 'PENDENTE',
  PROCESSADO = 'PROCESSADO',
  FALHOU = 'FALHOU',
}

@Entity('eventos_webhook')
@Index(['contaGatewayId', 'chaveDeduplicacao'], { unique: true })
export class EventoWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conta_gateway_id', type: 'varchar', length: 36 })
  contaGatewayId: string;

  @ManyToOne(() => ContaGateway, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_gateway_id' })
  contaGateway: Relation<ContaGateway>;

  @Column({ type: 'enum', enum: TipoEventoWebhook })
  tipo: TipoEventoWebhook;

  @Column({ name: 'chave_deduplicacao', type: 'varchar', length: 128 })
  chaveDeduplicacao: string;

  // O receptor deverá remover credenciais e dados de cartão antes da persistência.
  @Exclude()
  @Column({ type: 'json', select: false })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: EstadoProcessamentoWebhook,
    default: EstadoProcessamentoWebhook.PENDENTE,
  })
  estado: EstadoProcessamentoWebhook;

  @Column({
    name: 'processado_em',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  processadoEm: Date | null;

  @CreateDateColumn({ name: 'recebido_em', type: 'datetime', precision: 6 })
  recebidoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
