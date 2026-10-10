import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { ContaGateway } from '../../contas-gateway/entities/conta-gateway.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  nome: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Exclude()
  @Column({ name: 'senha_hash', type: 'varchar', length: 255, select: false })
  senhaHash: string;

  @OneToOne(() => ContaGateway, (conta) => conta.usuario)
  contaGateway?: Relation<ContaGateway> | null;

  @CreateDateColumn({ name: 'criado_em', type: 'datetime', precision: 6 })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'datetime', precision: 6 })
  atualizadoEm: Date;
}
