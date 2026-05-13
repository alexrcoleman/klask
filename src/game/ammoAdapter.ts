import bootAmmo from 'ammojs-typed';

type AmmoApi = Awaited<ReturnType<typeof bootAmmo>>;

export async function loadAmmo(): Promise<AmmoApi> {
  return bootAmmo();
}

export async function createAmmoWorld() {
  const Ammo = await loadAmmo();
  const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  const overlappingPairCache = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    overlappingPairCache,
    solver,
    collisionConfiguration,
  );

  world.setGravity(new Ammo.btVector3(0, 0, 0));

  return {
    Ammo,
    world,
    dispose() {
      Ammo.destroy(world);
      Ammo.destroy(solver);
      Ammo.destroy(overlappingPairCache);
      Ammo.destroy(dispatcher);
      Ammo.destroy(collisionConfiguration);
    },
  };
}
