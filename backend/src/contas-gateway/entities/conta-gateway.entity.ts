import { Exclude } from 'class-transformer';
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
import { Usuario } from '../../usuarios/entities/usuario.entity';

@Entity('contas_gateway')
export class ContaGateway {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'varchar', length: 36 })
  usuarioId: string;

  @OneToOne(() => Usuario, (usuario) => usuario.contaGateway, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({
    name: 'identificador_gateway',
    type: 'varchar',
    length: 36,
    unique: true,
  })
  identificadorGateway: string;

  @Column({ type: 'varchar', length: 14 })
  documento: string;

  @Exclude()
  @Column({
    name: 'codigo_cliente',
    type: 'int',
    unsigned: true,
    select: false,
  })
  codigoCliente: number;

  // Estes campos receberão somente conteúdo criptografado pelo serviço de integração.
  @Exclude()
  @Column({
    name: 'token_criptografado',
    type: 'text',
    nullable: true,
    select: false,
  })
  tokenCriptografado: string | null;

  @Exclude()
  @Column({
    name: 'chave_loja_criptografada',
    type: 'text',
    nullable: true,
    select: false,
  })
  chaveLojaCriptografada: string | null;

  @Column({
    name: 'token_expira_em',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  tokenExpiraEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'datetime', precision: 6 })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
