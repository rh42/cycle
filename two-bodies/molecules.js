import { MOLS } from '../data/molecules.js';
import { mountMolecule } from '../js/molecule.js';

for (const host of document.querySelectorAll('.mol-view')) {
  const mol = MOLS[host.dataset.key], c = mol.counts;
  mountMolecule(host, mol, { label: `${mol.label}, a ball-and-stick model: four fused rings, ${c.C} carbons, ${c.O} oxygens, ${c.H} hydrogens. Arrow keys turn it.` });
}
