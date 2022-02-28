import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ProductVariant, ProductMetal } from '@product/entities';

@Entity()
export class ProductMetalVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'tinyint',
  })
  quality: number;

  @Column({
    type: 'varchar',
    length: 20,
  })
  color: string;

  @ManyToOne(() => ProductMetal, (metal) => metal.variants)
  metal: ProductMetal;

  @OneToMany(() => ProductVariant, (variant) => variant.metal)
  variants: ProductVariant[];
}