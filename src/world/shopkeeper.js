import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX, TILE } from '../config.js';
import { rand } from '../rng.js';
import source from '../../assets/models/npcs/shopkeeper.bbmodel';

// The merchant behind the shop counter: a little hooded figure on a stool, idly jostling a purse of coins.
// Its model is rigged like the monsters' (body, head, arm_left, arm_right and the purse in the right hand),
// and it watches the player, greets them at the door and passes remarks on their shopping.

let template = null;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const JOSTLE = 0.72; // three bounces of the purse
const BOUNCE = JOSTLE / 3;

const LINES = {
  back: ['Back again? Good, good.', 'Still alive, I see. Good for business.', 'Ah, my favourite customer.'],
  sold: ['A fine choice.', 'Yesss. It will serve you. Probably.', 'Spend it while you live, I always say.', 'No refunds.'],
  bought: ['I suppose I can find a use for it.', 'Hmm. Yesss, this will do.', 'Another treasure for my shelves.', 'A pleasure doing business.'],
  poor: ['Your purse is too light, friend.', 'Gold first. Then we talk.', 'Come back richer. Or luckier.'],
  bye: ['Mind the dark.', 'Come back alive. The dead buy nothing.', 'Until the next floor... heh.'],
  fight: ['Not in my shop!', 'Take your quarrel outside!', 'Mind the stock!'],
};
const VOICES = ['rasps', 'whispers', 'murmurs', 'hisses'];

export class Shopkeeper {
  /** `at`: { x, y } in grid tiles and the yaw it faces, from the shop's layout (see rooms.js). */
  constructor(at) {
    template ??= buildBBModel(source, MODEL_PX, { rig: true });
    this.mesh = template.clone();
    this.x = at.x * TILE;
    this.z = at.y * TILE;
    this.yaw = at.yaw;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    this.bones = {};
    this.mesh.traverse((o) => {
      if (!o.isGroup || !o.name) return;
      this.bones[o.name] = o;
      o.userData.rest = { p: o.position.clone(), r: o.rotation.clone() };
    });

    this.look = 0; // head turn toward the player
    this.jostleIn = rand.range(1, 3);
    this.jostleT = -1; // time into the current jostle, or -1
    this.lift = 0;
    this.swing = 0; // the purse, swinging on its drawstring
    this.swingV = 0;
    this.visits = 0;
    this.insideT = 0;
    this.lastGreet = -Infinity;
    this.lastBye = -Infinity;
    this.lastFight = -Infinity;
    this.lastBoughtRemark = -Infinity;
    this.boughtAny = false;
    this.checkT = 0;
  }

  say(game, lines) {
    game.log(`The shopkeeper ${rand.pick(VOICES)}, "${rand.pick(lines)}"`, 'speech');
  }

  /** Called after each purchase. */
  sold(game, level) {
    if (level.items.some((it) => it.price)) this.say(game, LINES.sold);
    else this.say(game, ['You have bought me out! Heh. I will find more.']);
    this.jostleT = 0;
  }

  cantAfford(game) {
    this.say(game, LINES.poor);
  }

  /** Called after the player sells it something. Selling a pile of things only gets one remark. */
  boughtFromPlayer(game) {
    // Wall-clock time, because game time stands still while the pack is open.
    const now = performance.now();
    if (!this.boughtAny) this.say(game, ['I will set it out with my wares. Want it back? Pay my price, heh.']);
    else if (now - this.lastBoughtRemark > 6000) this.say(game, LINES.bought);
    this.boughtAny = true;
    this.lastBoughtRemark = now;
    this.jostleT = 0;
  }

  update(dt, game, level) {
    const p = game.player, t = game.time;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);

    // Greetings and farewells at the door, not too often.
    if (level.playerInShop) {
      if (this.insideT === 0 && t - this.lastGreet > 20) {
        this.lastGreet = t;
        if (this.visits++ === 0) {
          game.log('A small hooded figure peers at you over a counter of wares, coins clinking in its purse.', 'info');
          this.say(game, ['Ah... a customer. Look, look. Everything has its price. Something to sell? Show me your pack.']);
        } else this.say(game, LINES.back);
      }
      this.insideT += dt;
    } else {
      if (this.insideT > 3 && t - this.lastBye > 20) {
        this.lastBye = t;
        this.say(game, LINES.bye);
      }
      this.insideT = 0;
    }
    if ((this.checkT -= dt) <= 0) {
      this.checkT = 0.5;
      const brawl = level.playerInShop && level.monsters.some((m) => !m.dead && m.state === 'hunt' && level.inShop(m.x, m.z));
      if (brawl && t - this.lastFight > 25) {
        this.lastFight = t;
        this.say(game, LINES.fight);
      }
    }

    // Every few seconds it gives the purse a little shake; the coins are heard close by.
    if (this.jostleT < 0 && (this.jostleIn -= dt) <= 0) this.jostleT = 0;
    let lift = 0;
    if (this.jostleT >= 0) {
      if (this.jostleT === 0 && dist < 10) game.audio.coins(0.35 * (1 - dist / 10), 3);
      this.jostleT += dt;
      lift = Math.abs(Math.sin((this.jostleT / BOUNCE) * Math.PI)) * (1 - this.jostleT / JOSTLE);
      if (this.jostleT >= JOSTLE) {
        this.jostleT = -1;
        this.jostleIn = rand.range(2.2, 4.5);
        lift = 0;
      }
    }
    // The purse hangs from the hand like a pendulum, kicked by the hand's bounces.
    this.swingV += (-this.swing * 70 - this.swingV * 6) * dt + (lift - this.lift) * 5;
    this.swing += this.swingV * dt;
    this.lift = lift;

    // The head follows the player when they're near, and otherwise glances about.
    const near = dist < 12 && level.los(this.x, this.z, p.x, p.z);
    const want = near ? Math.max(-1.1, Math.min(1.1, wrapAngle(Math.atan2(dx, dz) - this.yaw))) : Math.sin(t * 0.37) * 0.5;
    this.look += (want - this.look) * Math.min(1, dt * 3);

    const b = this.bones;
    turn(b.body, Math.sin(t * 0.7) * 0.02, 0, Math.sin(t * 1.1) * 0.025);
    move(b.body, 0, lift * 0.012);
    turn(b.head, Math.sin(t * 0.9) * 0.03 + lift * 0.06, this.look, 0);
    turn(b.arm_left, Math.sin(t * 1.3) * 0.04);
    turn(b.arm_right, -lift * 0.22 + Math.sin(t * 1.3 + 1) * 0.03);
    turn(b.purse, this.swing, 0, Math.sin(t * 1.7) * 0.05);
  }
}

// Poses work relative to each bone's rest pose from the model, as the monsters' do.
function turn(bone, x = 0, y = 0, z = 0) {
  const r = bone.userData.rest.r;
  bone.rotation.set(r.x + x, r.y + y, r.z + z);
}
function move(bone, x = 0, y = 0, z = 0) {
  const p = bone.userData.rest.p;
  bone.position.set(p.x + x, p.y + y, p.z + z);
}
