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
import { Usuario } from '../../usuarios/entities/usuario.entity';

export enum EstadoSaque {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  NEGADO = 'NEGADO',
}

@Entity('saques')
@Index(['usuarioId', 'identificadorGateway'], { unique: true })
export class Saque {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'varchar', length: 36 })
  usuarioId: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ name: 'valor_centavos', type: 'int', unsigned: true })
  valorCentavos: number;

  @Exclude()
  @Column({ name: 'chave_pix', type: 'varchar', length: 254, select: false })
  chavePix: string;

  @Exclude()
  @Column({
    name: 'documento_titular',
    type: 'varchar',
    length: 14,
    select: false,
  })
  documentoTitular: string;

  @Column({
    name: 'referencia_externa',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  referenciaExterna: string;

  @Column({
    name: 'identificador_gateway',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  identificadorGateway: string | null;

  @Column({ type: 'enum', enum: EstadoSaque, default: EstadoSaque.PENDENTE })
  estado: EstadoSaque;

  @Column({
    name: 'motivo_negacao',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  motivoNegacao: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'datetime', precision: 6 })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
