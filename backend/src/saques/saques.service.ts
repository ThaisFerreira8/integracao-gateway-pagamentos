import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindOptionsSelect } from 'typeorm';
import { Saque } from './entities/saque.entity';

@Injectable()
export class SaquesService {
  private readonly camposPublicos: FindOptionsSelect<Saque> = {
    id: true,
    valorCentavos: true,
    referenciaExterna: true,
    estado: true,
    criadoEm: true,
    atualizadoEm: true,
  };

  constructor(
    @InjectRepository(Saque) private readonly saques: Repository<Saque>,
  ) {}

  async listar(usuarioId: string) {
    const saques = await this.saques.find({
      where: { usuarioId },
      select: this.camposPublicos,
      order: { criadoEm: 'DESC', id: 'DESC' },
    });
    return saques.map((saque) => this.apresentar(saque));
  }

  async consultar(usuarioId: string, id: string) {
    const saque = await this.saques.findOne({
      where: { id, usuarioId },
      select: this.camposPublicos,
    });
    if (!saque) throw new NotFoundException('Saque não encontrado.');
    return this.apresentar(saque);
  }

  private apresentar(saque: Saque) {
    // Não carrega chave Pix, documento ou mensagens livres que possam conter dados sensíveis.
    return {
      id: saque.id,
      valorCentavos: saque.valorCentavos,
      referenciaExterna: saque.referenciaExterna,
      estado: saque.estado,
      criadoEm: saque.criadoEm,
      atualizadoEm: saque.atualizadoEm,
    };
  }
}
