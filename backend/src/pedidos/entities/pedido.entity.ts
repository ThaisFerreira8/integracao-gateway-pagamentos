import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { LinkCheckout } from '../../checkouts/entities/link-checkout.entity';

export enum EstadoPedido {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  NEGADO = 'NEGADO',
}

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'link_checkout_id', type: 'varchar', length: 36 })
  linkCheckoutId: string;

  @OneToOne(() => LinkCheckout, (link) => link.pedido, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'link_checkout_id' })
  linkCheckout: Relation<LinkCheckout>;

  @Column({
    name: 'referencia_externa',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  referenciaExterna: string;

  // O pedido existe antes de o gateway devolver o identificador do pagamento.
  @Column({
    name: 'identificador_pagamento_gateway',
    type: 'varchar',
    length: 100,
    unique: true,
    nullable: true,
  })
  identificadorPagamentoGateway: string | null;

  @Column({ type: 'enum', enum: EstadoPedido, default: EstadoPedido.PENDENTE })
  estado: EstadoPedido;

  @CreateDateColumn({ name: 'criado_em', type: 'datetime', precision: 6 })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
