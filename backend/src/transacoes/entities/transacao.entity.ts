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
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Pedido } from '../../pedidos/entities/pedido.entity';

export enum TipoTransacao {
  PIX = 'PIX',
  CARTAO = 'CARTAO',
  SAQUE = 'SAQUE',
}

export enum EstadoTransacao {
  PENDENTE = 'PENDENTE',
  APROVADA = 'APROVADA',
  NEGADA = 'NEGADA',
  EXPIRADA = 'EXPIRADA',
  CANCELADA = 'CANCELADA',
}

@Entity('transacoes')
@Index(['usuarioId', 'identificadorGateway'], { unique: true })
export class Transacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'varchar', length: 36 })
  usuarioId: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ name: 'pedido_id', type: 'varchar', length: 36, nullable: true })
  pedidoId: string | null;

  @ManyToOne(() => Pedido, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Relation<Pedido> | null;

  @Column({ type: 'enum', enum: TipoTransacao })
  tipo: TipoTransacao;

  @Column({ name: 'valor_centavos', type: 'int', unsigned: true })
  valorCentavos: number;

  // Valores desconhecidos permanecem nulos até a confirmação do gateway.
  @Column({
    name: 'taxa_centavos',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  taxaCentavos: number | null;

  @Column({
    name: 'valor_liquido_centavos',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  valorLiquidoCentavos: number | null;

  @Column({
    type: 'enum',
    enum: EstadoTransacao,
    default: EstadoTransacao.PENDENTE,
  })
  estado: EstadoTransacao;

  @Column({
    name: 'referencia_externa',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenciaExterna: string | null;

  @Column({
    name: 'identificador_gateway',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  identificadorGateway: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'datetime', precision: 6 })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
