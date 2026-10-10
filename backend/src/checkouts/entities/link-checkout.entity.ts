import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Pedido } from '../../pedidos/entities/pedido.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';

export enum MetodoPagamento {
  PIX = 'PIX',
  CARTAO = 'CARTAO',
}

export enum EstadoLinkCheckout {
  ATIVO = 'ATIVO',
  PAGO = 'PAGO',
  EXPIRADO = 'EXPIRADO',
  CANCELADO = 'CANCELADO',
}

@Entity('links_checkout')
export class LinkCheckout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'identificador_publico',
    type: 'varchar',
    length: 36,
    unique: true,
  })
  identificadorPublico: string;

  @Column({ name: 'usuario_id', type: 'varchar', length: 36 })
  usuarioId: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ name: 'valor_centavos', type: 'int', unsigned: true })
  valorCentavos: number;

  @Column({ type: 'enum', enum: MetodoPagamento })
  metodo: MetodoPagamento;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  parcelas: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  bandeira: string | null;

  // Mantém a taxa contratada no link; alterações na tabela não reescrevem o histórico.
  @Column({
    name: 'taxa_aplicada_percentual',
    type: 'decimal',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  taxaAplicadaPercentual: string | null;

  @Column({
    type: 'enum',
    enum: EstadoLinkCheckout,
    default: EstadoLinkCheckout.ATIVO,
  })
  estado: EstadoLinkCheckout;

  @Column({ name: 'expira_em', type: 'datetime', precision: 6 })
  expiraEm: Date;

  @OneToOne(() => Pedido, (pedido) => pedido.linkCheckout)
  pedido?: Relation<Pedido> | null;

  @CreateDateColumn({ name: 'criado_em', type: 'datetime', precision: 6 })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
