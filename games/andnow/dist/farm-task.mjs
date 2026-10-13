// test/canary.json
var canary_default = [{ case: { sources: ["name: amoeba-g\n# morph4-amoeba with one cell changed (e \u2192 G): grows fat as it oozes\ndir: W\nip: 4 4\n---\n  m\n  *T\n  1WBCs\n  +=\\M\n +GmLA\nR+dWCmLC\n   L=/:\n   4\n", "name: Turtle\n# Stays put. Bombs the nearest enemy in range, grows armor in a random direction,\n# collects whatever touches it. The rings of `.` are armor and do nothing.\nip: 1 1\n---\n.........\n.2S$B4y0GC\n.........\n"], seed: 8 }, final: 3272579777, ticks: 2e3 }, { case: { sources: ["name: amoeba-g\n# morph4-amoeba with one cell changed (e \u2192 G): grows fat as it oozes\ndir: W\nip: 4 4\n---\n  m\n  *T\n  1WBCs\n  +=\\M\n +GmLA\nR+dWCmLC\n   L=/:\n   4\n", "name: map3-mixed\n# map-elites run map3, slot 2-3-3 (mixed), was m197-75976 (gen 197, parents m189-72802+)\n# fitness 2.01; 19W of 46; per game: 0.04 bomb hits, 0.04 poison writes, 2.46 pickups; left home in 80% of games\ndir: E\nip: 0 2\n---\n    .\nv   >oo'@WC\\$:MB\n>C2S|      $\n^   >$$:Mem+\nM\n"], seed: 37 }, final: 1952829904, ticks: 2e3 }, { case: { sources: ["name: Amoeba\n# The petri dish founder: a Gatherer (collect, head for the nearest resource) that DIVIDEs\n# every loop (D pops an empty stack = east): copies itself beside itself as a new\n# warrior. Its descendants are rivals like anyone else. The two fat cells under it are\n# spare: copy errors can turn them into armor (K) without breaking the program.\n---\nC6S$TMD\n..\n", "name: Viper\n# Poison at range 2. Like the Bomber, but the found row writes `@` (code 9) into the\n# nearest enemy cell instead of bombing. WRITE fails quietly beyond range 2.\n# 9 is pushed as a number, so the Viper carries no `@` of its own to run into.\nip: 0 1\n---\nv   >oo9WT\\$:M\n>C2S|\n^   >$$:Me!+\n"], seed: 66 }, final: 1622709016, ticks: 2e3 }, { case: { sources: ["name: Amoeba\n# The petri dish founder: a Gatherer (collect, head for the nearest resource) that DIVIDEs\n# every loop (D pops an empty stack = east): copies itself beside itself as a new\n# warrior. Its descendants are rivals like anyone else. The two fat cells under it are\n# spare: copy errors can turn them into armor (K) without breaking the program.\n---\nC6S$TMD\n..\n", "name: map3-none\n# map-elites run map3, slot 0-4-2 (none), was m199-76527 (gen 199, parents m192-73841+point)\n# fitness 2.34; 30W of 46; per game: 0.00 bomb hits, 0.00 poison writes, 7.20 pickups; left home in 67% of games\ndir: E\nip: 7 3\n---\n  M\n>#ov  B>oo'\n|\\ >m2S|\n>d$CMem+\n"], seed: 95 }, final: 473889689, ticks: 2e3 }, { case: { sources: ["name: Blob\n# The Oozer's loop with two rows of fat: a blob that oozes, squeezing through gaps.\n---\nC6S$TA\n......\n......\n", "name: crawler\n# morph4 gen ~115, slot 0-4-3: 22 cells (mostly fat) that ooze ~850 cells/game; whole body into another room on 18/20 solo boards; barely collects\ndir: S\nip: 7 2\n---\nCTT\n  =6S \\A\n  ...!..\n  ......\n     dM\n"], seed: 124 }, final: 901941241, ticks: 2e3 }, { case: { sources: ["name: Blob\n# The Oozer's loop with two rows of fat: a blob that oozes, squeezing through gaps.\n---\nC6S$TA\n......\n......\n", "name: map4-bomber\n# map-elites run map4, slot 1-4-3 (bomber), was m298-114704 (gen 298, parents m295-113526+point)\n# fitness 2.90; 20W of 36; per game: 4.19 bomb hits, 0.00 poison writes, 4.69 pickups; left home in 89% of games\ndir: E\nip: 3 1\n---\n v  WBoo'@W .\n$>C2S|     W$\n ^<  >$$:Mem+\n"], seed: 153 }, final: 390846299, ticks: 2e3 }, { case: { sources: ["name: Bomber\n# Like the Stalker, but bombs at range instead of poisoning by touch.\n# Found an enemy (top row): bomb it (fails quietly if out of range), step toward it.\n# Nothing in sight (bottom row): keep wandering; turn right when blocked.\nip: 0 1\n---\nv   >ooBT\\$:M\n>C2S|\n^   >$$:Me!+\n", "name: evo1-3\n# evolved: run evo1, was g94-8652 (parents g90-8298\xD7g93-8634)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n S :mL\n^>:fS|  \\T\n ^y m>$$CM2eBR\n"], seed: 182 }, final: 2504940674, ticks: 2e3 }, { case: { sources: ["name: Bomber\n# Like the Stalker, but bombs at range instead of poisoning by touch.\n# Found an enemy (top row): bomb it (fails quietly if out of range), step toward it.\n# Nothing in sight (bottom row): keep wandering; turn right when blocked.\nip: 0 1\n---\nv   >ooBT\\$:M\n>C2S|\n^   >$$:Me!+\n", "name: map4-poisoner\n# map-elites run map4, slot 3-4-3 (poisoner), was m296-113891 (gen 296, parents m289-111025+)\n# fitness 2.19; 51W of 108; per game: 0.89 bomb hits, 20.75 poison writes, 7.06 pickups; left home in 100% of games\ndir: W\nip: 1 2\n---\n       .\nM  v  +>oo'@W B\n:S$>C2S|     W$\n   ^   >$$:Mem+\n"], seed: 211 }, final: 3155712965, ticks: 2e3 }, { case: { sources: ["name: Gatherer\n# One row, so the IP just loops along it forever (the row wraps within the body).\n# Collect anything touching me; find the nearest visible resource; head toward it\n# (TOWARD of 0,0 is a random direction, so with nothing in sight it wanders).\n---\nC6S$TM\n", "name: evo3-1\n# evolved: run evo3, was g140-17481 (parents g139-17263\xD7g139-17331)\n# held-out vs benchmarks: 61/110 wins; bomber 6-3, gatherer 7-3, roamer 3-4, stalker 7-2, turtle 4-0, evo1-1 5-0, evo1-2 5-0, evo1-3 5-0, evo2-1 6-3, evo2-2 5-4, evo2-3 8-1\ndir: E\nip: 6 3\n---\n   M\n  [m- =!  d`\n BW:B<R X BRW\n.TMS7C-BTM?\n"], seed: 240 }, final: 64482445, ticks: 2e3 }, { case: { sources: ["name: Gatherer\n# One row, so the IP just loops along it forever (the row wraps within the body).\n# Collect anything touching me; find the nearest visible resource; head toward it\n# (TOWARD of 0,0 is a random direction, so with nothing in sight it wanders).\n---\nC6S$TM\n", "name: morph1-still\n# map-elites run morph1, slot 2-0-0 (still), was m249-95875 (gen 249, parents m150-57657+point)\n# fitness 2.09; 13W of 30; per game: 0.33 bomb hits, 0.87 poison writes, 2.53 pickups; left home in 93% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 0% of games\ndir: E\nip: 11 3\n---\n      .\n  v  +>oo'@W B\n:$>C2S|   B-BB\n  ^   >$$:Mem+\n"], seed: 269 }, final: 2756900365, ticks: 2e3 }, { case: { sources: ["name: Oozer\n# A Gatherer that OOZEs instead of SHIFTing: collect, scan for a resource, head that way\n# one cell at a time. Its rearmost cell keeps moving to its front, so its body (and the\n# order of its program) changes as it goes. A seed for evolving amorphous warriors.\n---\nC6S$TA\n", "name: evo4-3\n# evolved: run evo4, was g142-17669 (parents g141-17501+ip,ip)\n# held-out vs benchmarks: 138/150 wins; bomber 7-3, gatherer 10-0, roamer 9-0, stalker 10-0, turtle 9-0, viper 10-0, evo1-1 9-0, evo1-2 9-0, evo1-3 9-0, evo2-1 9-0, evo2-2 9-0, evo2-3 10-0, evo3-1 9-1, evo3-2 9-0, evo3-3 10-0\ndir: W\nip: 5 2\n---\n  S\nSM3 -?.\\S`Me\n  :M>2S$B8yCM\n   >  4 S-[MM\n"], seed: 298 }, final: 2932629339, ticks: 2e3 }, { case: { sources: ["name: Oozer\n# A Gatherer that OOZEs instead of SHIFTing: collect, scan for a resource, head that way\n# one cell at a time. Its rearmost cell keeps moving to its front, so its body (and the\n# order of its program) changes as it goes. A seed for evolving amorphous warriors.\n---\nC6S$TA\n", "name: morph2-still\n# map-elites run morph2, slot 1-0-0 (still), was m247-95084 (gen 247, parents m242-93180+dir)\n# fitness 1.94; 19W of 60; per game: 1.27 bomb hits, 0.00 poison writes, 4.97 pickups; left home in 83% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 17% of games\ndir: W\nip: 9 3\n---\n      .\n  v  MB\nAX>C2S|$    W$\n >^LA5>$$:Mem+\n     T\n"], seed: 327 }, final: 2614600182, ticks: 2e3 }, { case: { sources: ["name: Roamer\n# A gatherer with a memory: the wander direction lives at the bottom of the stack.\n# Found a resource (top row): head toward it, and adopt that as the wander direction.\n# Nothing in sight (bottom row): keep going the same way; turn right when blocked.\nip: 0 1\n---\nv   >T\\$:M\n>C6S|\n^   >$$:Me!+\n", "name: evo6-3\n# evolved: run evo6, was g136-16889 (parents g135-16802+remove)\n# held-out vs benchmarks: 61/140 wins; bomber 3-2, gatherer 7-3, roamer 4-1, stalker 4-1, turtle 4-1, viper 4-1, evo2-2 5-0, evo3-1 6-0, evo4-1 2-5, evo4-2 4-2, evo4-3 3-3, evo5-1 4-2, evo5-2 5-2, evo5-3 6-2\ndir: W\nip: 4 1\n---\nCo RCr_%de y\n :M>2S$B8CyMC\n CM[ v @  e_\n"], seed: 356 }, final: 933318217, ticks: 2e3 }, { case: { sources: ["name: Roamer\n# A gatherer with a memory: the wander direction lives at the bottom of the stack.\n# Found a resource (top row): head toward it, and adopt that as the wander direction.\n# Nothing in sight (bottom row): keep going the same way; turn right when blocked.\nip: 0 1\n---\nv   >T\\$:M\n>C6S|\n^   >$$:Me!+\n", "name: morph4-twitch\n# map-elites run morph4, slot 0-1-1 (twitch), was m397-152563 (gen 397, parents m37-14565\xD7m395-151787)\n# fitness 2.38; 18W of 28; per game: 0.00 bomb hits, 0.00 poison writes, 8.50 pickups; left home in 29% of games\n# shape changes 5.7 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 11 2\n---\nd   *.\nCv TCB6-\n9>C2S|     3@C\n ^ SA>$$:Mem+\n"], seed: 385 }, final: 1645452998, ticks: 2e3 }, { case: { sources: ["name: Stalker\n# Hunt the nearest enemy cell; when touching it, write the poison glyph @ into it.\n# The wander direction lives at the bottom of the stack (like the Roamer).\n# Middle row decides: SCAN for an enemy, `|` sends the IP north if found, south if not.\n# Found (top row): copy dx,dy (`oo`), write @ there (`'@` pushes the code of @ and\n# skips it), then step toward it and adopt that as the wander direction.\n# Not found (bottom row): drop dx,dy, keep wandering; turn right when blocked.\n# Both rows wrap back to their first cell, which points the IP back into the middle row.\n# (Without the branch, a failed SCAN gives 0,0 = my own IP cell, and I poison myself.)\nip: 0 1\n---\nv   >oo'@WT\\$:M\n>C2S|\n^   >$$:Me!+\n", "name: map3-bomber\n# map-elites run map3, slot 1-4-3 (bomber), was m198-76057 (gen 198, parents m53-20474+point,remove)\n# fitness 2.95; 35W of 46; per game: 3.65 bomb hits, 0.00 poison writes, 4.61 pickups; left home in 100% of games\ndir: W\nip: 12 2\n---\n    +\nMFS -y  \\$+8\n  :M>>2S$B8CyMC\n   4r^  +   $r\n"], seed: 414 }, final: 1540965837, ticks: 2e3 }, { case: { sources: ["name: Turtle\n# Stays put. Bombs the nearest enemy in range, grows armor in a random direction,\n# collects whatever touches it. The rings of `.` are armor and do nothing.\nip: 1 1\n---\n.........\n.2S$B4y0GC\n.........\n", "name: evo2-1\n# evolved: run evo2, was g138-17186 (parents g137-16995+add)\n# held-out vs benchmarks: 22/50 wins; bomber 6-2, gatherer 2-4, roamer 3-4, stalker 7-2, turtle 4-0\ndir: E\nip: 2 4\n---\n  S\n  W\n  BvvF|73<$\nT|^`?BT SB-:M\n  7oCBTM?\n"], seed: 443 }, final: 1454444478, ticks: 2e3 }, { case: { sources: ["name: Turtle\n# Stays put. Bombs the nearest enemy in range, grows armor in a random direction,\n# collects whatever touches it. The rings of `.` are armor and do nothing.\nip: 1 1\n---\n.........\n.2S$B4y0GC\n.........\n", "name: morph1-amoeba\n# map-elites run morph1, slot 1-4-2 (amoeba), was m158-60820 (gen 158, parents m139-53708+point)\n# fitness 2.08; 932W of 2730; per game: 1.77 bomb hits, 0.00 poison writes, 3.13 pickups; left home in 97% of games\n# shape changes 205.0 cells/game; squeezed through a narrow passage in 53% of games\ndir: W\nip: 12 1\n---\n  v 2+BBA'@\\\nA$>C2S|     2B\n >^ A >$$:Mem+\n"], seed: 472 }, final: 1543602921, ticks: 2e3 }, { case: { sources: ["name: Viper\n# Poison at range 2. Like the Bomber, but the found row writes `@` (code 9) into the\n# nearest enemy cell instead of bombing. WRITE fails quietly beyond range 2.\n# 9 is pushed as a number, so the Viper carries no `@` of its own to run into.\nip: 0 1\n---\nv   >oo9WT\\$:M\n>C2S|\n^   >$$:Me!+\n", "name: evo5-1\n# evolved: run evo5, was g138-17128 (parents g137-17041\xD7g137-17108)\n# held-out vs benchmarks: 50/110 wins; bomber 2-2, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-1, viper 4-1, evo2-2 5-0, evo3-1 8-0, evo4-1 4-2, evo4-2 3-3, evo4-3 2-4\ndir: W\nip: 10 1\n---\n .G$3-CC3-\n:M>2S$B8CyM\ner     XM-@d\n=\n"], seed: 501 }, final: 866318460, ticks: 2e3 }, { case: { sources: ["name: Viper\n# Poison at range 2. Like the Bomber, but the found row writes `@` (code 9) into the\n# nearest enemy cell instead of bombing. WRITE fails quietly beyond range 2.\n# 9 is pushed as a number, so the Viper carries no `@` of its own to run into.\nip: 0 1\n---\nv   >oo9WT\\$:M\n>C2S|\n^   >$$:Me!+\n", "name: morph2-twitch\n# map-elites run morph2, slot 1-1-2 (twitch), was m237-91376 (gen 237, parents m235-90361+point,point)\n# fitness 1.95; 100W of 300; per game: 2.40 bomb hits, 0.00 poison writes, 9.77 pickups; left home in 93% of games\n# shape changes 3.3 cells/game; squeezed through a narrow passage in 50% of games\ndir: E\nip: 2 2\n---\n      .\n  $  CBBAG@  B\nA7>C2S|     W$\n >^ AS>$$:Mem+\n"], seed: 530 }, final: 2774173520, ticks: 2e3 }, { case: { sources: ["name: amoeba-g\n# morph4-amoeba with one cell changed (e \u2192 G): grows fat as it oozes\ndir: W\nip: 4 4\n---\n  m\n  *T\n  1WBCs\n  +=\\M\n +GmLA\nR+dWCmLC\n   L=/:\n   4\n", "name: map2-none\n# map-elites run map2, slot 0-3-3 (none), was m249-95832 (gen 249, parents m245-94228+point)\n# fitness 2.03; 21W of 36; per game: 0.00 bomb hits, 0.00 poison writes, 3.56 pickups; left home in 97% of games\ndir: S\nip: 0 1\n---\n    .\nv   >oo'@WT\\$vMB\n>C2S|      $\n^   >$$:Mem+\nM\n"], seed: 559 }, final: 3253046893, ticks: 2e3 }, { case: { sources: ["name: crawler\n# morph4 gen ~115, slot 0-4-3: 22 cells (mostly fat) that ooze ~850 cells/game; whole body into another room on 18/20 solo boards; barely collects\ndir: S\nip: 7 2\n---\nCTT\n  =6S \\A\n  ...!..\n  ......\n     dM\n", "name: evo2-2\n# evolved: run evo2, was g147-18236 (parents g146-18130+remove)\n# held-out vs benchmarks: 23/50 wins; bomber 7-2, gatherer 2-4, roamer 4-2, stalker 7-2, turtle 3-0\ndir: E\nip: 3 4\n---\n S\n T\nFT^^B G3<\n\\' B: \\BB-:\n STCBTM? TT\n"], seed: 588 }, final: 2573118444, ticks: 415 }, { case: { sources: ["name: crawler\n# morph4 gen ~115, slot 0-4-3: 22 cells (mostly fat) that ooze ~850 cells/game; whole body into another room on 18/20 solo boards; barely collects\ndir: S\nip: 7 2\n---\nCTT\n  =6S \\A\n  ...!..\n  ......\n     dM\n", "name: morph1-morph\n# map-elites run morph1, slot 1-2-0 (morph), was m248-95532 (gen 248, parents m242-93223+dupe)\n# fitness 2.42; 12W of 30; per game: 2.90 bomb hits, 0.00 poison writes, 2.20 pickups; left home in 97% of games\n# shape changes 16.8 cells/game; squeezed through a narrow passage in 13% of games\ndir: W\nip: 6 2\n---\n v 2+BBA2@\\\n >C2S|     !B\n>^ AA>$$:Mem+\n>\n"], seed: 617 }, final: 358672342, ticks: 71 }, { case: { sources: ["name: evo1-1\n# evolved: run evo1, was g82-7551 (parents g81-7503\xD7g81-7461)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n MC: L\n^>CfS|  \\T\n ^y m>$$:M2eBR\n", "name: evo6-2\n# evolved: run evo6, was g147-18251 (parents g146-18184\xD7g146-18116)\n# held-out vs benchmarks: 61/140 wins; bomber 2-3, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-0, viper 4-1, evo2-2 6-0, evo3-1 6-0, evo4-1 4-1, evo4-2 4-1, evo4-3 4-1, evo5-1 1-4, evo5-2 4-2, evo5-3 4-2\ndir: W\nip: 4 2\n---\n5\nCo yM \\-+e y\n :M>2S$B8CyMC\n C.^   @+ $S\n"], seed: 646 }, final: 3012976978, ticks: 2e3 }, { case: { sources: ["name: evo1-1\n# evolved: run evo1, was g82-7551 (parents g81-7503\xD7g81-7461)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n MC: L\n^>CfS|  \\T\n ^y m>$$:M2eBR\n", "name: morph4-still\n# map-elites run morph4, slot 1-0-1 (still), was m397-152498 (gen 397, parents m393-151022+point,remove,add,ip)\n# fitness 2.21; 30W of 56; per game: 0.21 bomb hits, 0.00 poison writes, 7.96 pickups; left home in 29% of games\n# shape changes 0.0 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 5 1\n---\n     M.\n Cv TCBB      ^\nT7>2CS|     3@C\n >^ A >$$:Mem+\n"], seed: 675 }, final: 2458524150, ticks: 2e3 }, { case: { sources: ["name: evo1-2\n# evolved: run evo1, was g90-8298 (parents g89-8267+remove)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n S : L\n^>:fS|  \\T\n ^y m>$$CM2eBR\n", "name: map4-mixed\n# map-elites run map4, slot 2-3-3 (mixed), was m297-114224 (gen 297, parents m286-109904+)\n# fitness 2.25; 27W of 72; per game: 2.28 bomb hits, 0.72 poison writes, 2.97 pickups; left home in 97% of games\ndir: E\nip: 14 2\n---\n       .\nM  v  +>oo'@W B\n:M$>C2S|     W$\n   ^   >$$:Mem+\n"], seed: 704 }, final: 3903975061, ticks: 2e3 }, { case: { sources: ["name: evo1-3\n# evolved: run evo1, was g94-8652 (parents g90-8298\xD7g93-8634)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n S :mL\n^>:fS|  \\T\n ^y m>$$CM2eBR\n", "name: evo5-3\n# evolved: run evo5, was g143-17853 (parents g142-17652+remove)\n# held-out vs benchmarks: 47/110 wins; bomber 3-1, gatherer 8-2, roamer 3-1, stalker 3-1, turtle 6-0, viper 2-2, evo2-2 7-0, evo3-1 5-0, evo4-1 4-3, evo4-2 3-4, evo4-3 3-4\ndir: W\nip: 3 1\n---\n y$M  ^_ :W-\n:M>2S$B8CyMC\n y4 T <-4$>\n"], seed: 733 }, final: 306135737, ticks: 2e3 }, { case: { sources: ["name: evo1-3\n# evolved: run evo1, was g94-8652 (parents g90-8298\xD7g93-8634)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n S :mL\n^>:fS|  \\T\n ^y m>$$CM2eBR\n", "name: morph4-morph\n# map-elites run morph4, slot 1-2-1 (morph), was m397-152481 (gen 397, parents m391-150471+swap,point,point)\n# fitness 2.51; 36W of 56; per game: 0.29 bomb hits, 0.00 poison writes, 8.79 pickups; left home in 39% of games\n# shape changes 20.6 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 36%\ndir: W\nip: 11 3\n---\n    <\nd   >.\nCv TCB<-\n9>C2S|     3@C\n ^ A >=$:Mem+\n"], seed: 762 }, final: 3648067633, ticks: 2e3 }, { case: { sources: ["name: evo2-1\n# evolved: run evo2, was g138-17186 (parents g137-16995+add)\n# held-out vs benchmarks: 22/50 wins; bomber 6-2, gatherer 2-4, roamer 3-4, stalker 7-2, turtle 4-0\ndir: E\nip: 2 4\n---\n  S\n  W\n  BvvF|73<$\nT|^`?BT SB-:M\n  7oCBTM?\n", "name: map4-mixed\n# map-elites run map4, slot 2-3-3 (mixed), was m297-114224 (gen 297, parents m286-109904+)\n# fitness 2.25; 27W of 72; per game: 2.28 bomb hits, 0.72 poison writes, 2.97 pickups; left home in 97% of games\ndir: E\nip: 14 2\n---\n       .\nM  v  +>oo'@W B\n:M$>C2S|     W$\n   ^   >$$:Mem+\n"], seed: 791 }, final: 1765107638, ticks: 2e3 }, { case: { sources: ["name: evo2-2\n# evolved: run evo2, was g147-18236 (parents g146-18130+remove)\n# held-out vs benchmarks: 23/50 wins; bomber 7-2, gatherer 2-4, roamer 4-2, stalker 7-2, turtle 3-0\ndir: E\nip: 3 4\n---\n S\n T\nFT^^B G3<\n\\' B: \\BB-:\n STCBTM? TT\n", "name: evo6-2\n# evolved: run evo6, was g147-18251 (parents g146-18184\xD7g146-18116)\n# held-out vs benchmarks: 61/140 wins; bomber 2-3, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-0, viper 4-1, evo2-2 6-0, evo3-1 6-0, evo4-1 4-1, evo4-2 4-1, evo4-3 4-1, evo5-1 1-4, evo5-2 4-2, evo5-3 4-2\ndir: W\nip: 4 2\n---\n5\nCo yM \\-+e y\n :M>2S$B8CyMC\n C.^   @+ $S\n"], seed: 820 }, final: 642878751, ticks: 2e3 }, { case: { sources: ["name: evo2-2\n# evolved: run evo2, was g147-18236 (parents g146-18130+remove)\n# held-out vs benchmarks: 23/50 wins; bomber 7-2, gatherer 2-4, roamer 4-2, stalker 7-2, turtle 3-0\ndir: E\nip: 3 4\n---\n S\n T\nFT^^B G3<\n\\' B: \\BB-:\n STCBTM? TT\n", "name: morph4-still\n# map-elites run morph4, slot 1-0-1 (still), was m397-152498 (gen 397, parents m393-151022+point,remove,add,ip)\n# fitness 2.21; 30W of 56; per game: 0.21 bomb hits, 0.00 poison writes, 7.96 pickups; left home in 29% of games\n# shape changes 0.0 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 5 1\n---\n     M.\n Cv TCBB      ^\nT7>2CS|     3@C\n >^ A >$$:Mem+\n"], seed: 849 }, final: 2551385531, ticks: 2e3 }, { case: { sources: ["name: evo2-3\n# evolved: run evo2, was g133-16531 (parents g132-16407+point,remove)\n# held-out vs benchmarks: 22/50 wins; bomber 7-1, gatherer 2-4, roamer 2-4, stalker 6-2, turtle 5-0\ndir: W\nip: 3 2\n---\n B+vF|B3<7\nB^`?|T\\SB-\n 7 CBTM?:\n", "name: morph1-morph\n# map-elites run morph1, slot 1-2-0 (morph), was m248-95532 (gen 248, parents m242-93223+dupe)\n# fitness 2.42; 12W of 30; per game: 2.90 bomb hits, 0.00 poison writes, 2.20 pickups; left home in 97% of games\n# shape changes 16.8 cells/game; squeezed through a narrow passage in 13% of games\ndir: W\nip: 6 2\n---\n v 2+BBA2@\\\n >C2S|     !B\n>^ AA>$$:Mem+\n>\n"], seed: 878 }, final: 1116706560, ticks: 2e3 }, { case: { sources: ["name: evo3-1\n# evolved: run evo3, was g140-17481 (parents g139-17263\xD7g139-17331)\n# held-out vs benchmarks: 61/110 wins; bomber 6-3, gatherer 7-3, roamer 3-4, stalker 7-2, turtle 4-0, evo1-1 5-0, evo1-2 5-0, evo1-3 5-0, evo2-1 6-3, evo2-2 5-4, evo2-3 8-1\ndir: E\nip: 6 3\n---\n   M\n  [m- =!  d`\n BW:B<R X BRW\n.TMS7C-BTM?\n", "name: map2-none\n# map-elites run map2, slot 0-3-3 (none), was m249-95832 (gen 249, parents m245-94228+point)\n# fitness 2.03; 21W of 36; per game: 0.00 bomb hits, 0.00 poison writes, 3.56 pickups; left home in 97% of games\ndir: S\nip: 0 1\n---\n    .\nv   >oo'@WT\\$vMB\n>C2S|      $\n^   >$$:Mem+\nM\n"], seed: 907 }, final: 3337203731, ticks: 2e3 }, { case: { sources: ["name: evo3-2\n# evolved: run evo3, was g149-18493 (parents g147-18235+remove,dupe)\n# held-out vs benchmarks: 59/110 wins; bomber 4-3, gatherer 7-3, roamer 5-2, stalker 7-2, turtle 4-1, evo1-1 5-0, evo1-2 5-0, evo1-3 5-0, evo2-1 5-5, evo2-2 5-5, evo2-3 7-2\ndir: E\nip: 6 3\n---\n   MS     -\n  -<-    dd`\n  $|G< BT!B[\n.TMS7C-BTM?\n", "name: evo5-1\n# evolved: run evo5, was g138-17128 (parents g137-17041\xD7g137-17108)\n# held-out vs benchmarks: 50/110 wins; bomber 2-2, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-1, viper 4-1, evo2-2 5-0, evo3-1 8-0, evo4-1 4-2, evo4-2 3-3, evo4-3 2-4\ndir: W\nip: 10 1\n---\n .G$3-CC3-\n:M>2S$B8CyM\ner     XM-@d\n=\n"], seed: 936 }, final: 3177409164, ticks: 2e3 }, { case: { sources: ["name: evo3-2\n# evolved: run evo3, was g149-18493 (parents g147-18235+remove,dupe)\n# held-out vs benchmarks: 59/110 wins; bomber 4-3, gatherer 7-3, roamer 5-2, stalker 7-2, turtle 4-1, evo1-1 5-0, evo1-2 5-0, evo1-3 5-0, evo2-1 5-5, evo2-2 5-5, evo2-3 7-2\ndir: E\nip: 6 3\n---\n   MS     -\n  -<-    dd`\n  $|G< BT!B[\n.TMS7C-BTM?\n", "name: morph2-twitch\n# map-elites run morph2, slot 1-1-2 (twitch), was m237-91376 (gen 237, parents m235-90361+point,point)\n# fitness 1.95; 100W of 300; per game: 2.40 bomb hits, 0.00 poison writes, 9.77 pickups; left home in 93% of games\n# shape changes 3.3 cells/game; squeezed through a narrow passage in 50% of games\ndir: E\nip: 2 2\n---\n      .\n  $  CBBAG@  B\nA7>C2S|     W$\n >^ AS>$$:Mem+\n"], seed: 965 }, final: 3116389572, ticks: 2e3 }, { case: { sources: ["name: evo3-3\n# evolved: run evo3, was g144-17963 (parents g143-17821\xD7g143-17777)\n# held-out vs benchmarks: 57/110 wins; bomber 4-5, gatherer 7-3, roamer 2-4, stalker 7-2, turtle 4-1, evo1-1 5-0, evo1-2 5-0, evo1-3 5-0, evo2-1 5-4, evo2-2 5-4, evo2-3 8-1\ndir: E\nip: 6 3\n---\n   M\n  -<- $!  d`\n s S /R!TmB[W\n.TMS7C-BTM?\n", "name: morph1-amoeba\n# map-elites run morph1, slot 1-4-2 (amoeba), was m158-60820 (gen 158, parents m139-53708+point)\n# fitness 2.08; 932W of 2730; per game: 1.77 bomb hits, 0.00 poison writes, 3.13 pickups; left home in 97% of games\n# shape changes 205.0 cells/game; squeezed through a narrow passage in 53% of games\ndir: W\nip: 12 1\n---\n  v 2+BBA'@\\\nA$>C2S|     2B\n >^ A >$$:Mem+\n"], seed: 994 }, final: 3119127792, ticks: 2e3 }, { case: { sources: ["name: evo4-1\n# evolved: run evo4, was g141-17574 (parents g140-17376\xD7g140-17398)\n# held-out vs benchmarks: 145/150 wins; bomber 9-1, gatherer 10-0, roamer 10-0, stalker 10-0, turtle 8-0, viper 10-0, evo1-1 10-0, evo1-2 10-0, evo1-3 10-0, evo2-1 10-0, evo2-2 9-0, evo2-3 10-0, evo3-1 10-0, evo3-2 9-0, evo3-3 10-0\ndir: W\nip: 4 2\n---\n$T\nFBC-  rS\\+!:\n :M>2S$B8yCM\n  4r>4    -[\n", "name: map3-bomber\n# map-elites run map3, slot 1-4-3 (bomber), was m198-76057 (gen 198, parents m53-20474+point,remove)\n# fitness 2.95; 35W of 46; per game: 3.65 bomb hits, 0.00 poison writes, 4.61 pickups; left home in 100% of games\ndir: W\nip: 12 2\n---\n    +\nMFS -y  \\$+8\n  :M>>2S$B8CyMC\n   4r^  +   $r\n"], seed: 1023 }, final: 1526976115, ticks: 2e3 }, { case: { sources: ["name: evo4-2\n# evolved: run evo4, was g134-16652 (parents g132-16380\xD7g133-16505)\n# held-out vs benchmarks: 138/150 wins; bomber 8-2, gatherer 10-0, roamer 9-0, stalker 10-0, turtle 8-0, viper 10-0, evo1-1 9-0, evo1-2 9-0, evo1-3 9-0, evo2-1 9-0, evo2-2 9-0, evo2-3 10-0, evo3-1 9-1, evo3-2 9-0, evo3-3 10-0\ndir: W\nip: 4 2\n---\n S\n!3 - S1\\S+!R\n :M>2S$B8yCM\n  >  S  -[-R\n", "name: evo6-3\n# evolved: run evo6, was g136-16889 (parents g135-16802+remove)\n# held-out vs benchmarks: 61/140 wins; bomber 3-2, gatherer 7-3, roamer 4-1, stalker 4-1, turtle 4-1, viper 4-1, evo2-2 5-0, evo3-1 6-0, evo4-1 2-5, evo4-2 4-2, evo4-3 3-3, evo5-1 4-2, evo5-2 5-2, evo5-3 6-2\ndir: W\nip: 4 1\n---\nCo RCr_%de y\n :M>2S$B8CyMC\n CM[ v @  e_\n"], seed: 1052 }, final: 4155588172, ticks: 2e3 }, { case: { sources: ["name: evo4-2\n# evolved: run evo4, was g134-16652 (parents g132-16380\xD7g133-16505)\n# held-out vs benchmarks: 138/150 wins; bomber 8-2, gatherer 10-0, roamer 9-0, stalker 10-0, turtle 8-0, viper 10-0, evo1-1 9-0, evo1-2 9-0, evo1-3 9-0, evo2-1 9-0, evo2-2 9-0, evo2-3 10-0, evo3-1 9-1, evo3-2 9-0, evo3-3 10-0\ndir: W\nip: 4 2\n---\n S\n!3 - S1\\S+!R\n :M>2S$B8yCM\n  >  S  -[-R\n", "name: morph4-twitch\n# map-elites run morph4, slot 0-1-1 (twitch), was m397-152563 (gen 397, parents m37-14565\xD7m395-151787)\n# fitness 2.38; 18W of 28; per game: 0.00 bomb hits, 0.00 poison writes, 8.50 pickups; left home in 29% of games\n# shape changes 5.7 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 11 2\n---\nd   *.\nCv TCB6-\n9>C2S|     3@C\n ^ SA>$$:Mem+\n"], seed: 1081 }, final: 1084634080, ticks: 2e3 }, { case: { sources: ["name: evo4-3\n# evolved: run evo4, was g142-17669 (parents g141-17501+ip,ip)\n# held-out vs benchmarks: 138/150 wins; bomber 7-3, gatherer 10-0, roamer 9-0, stalker 10-0, turtle 9-0, viper 10-0, evo1-1 9-0, evo1-2 9-0, evo1-3 9-0, evo2-1 9-0, evo2-2 9-0, evo2-3 10-0, evo3-1 9-1, evo3-2 9-0, evo3-3 10-0\ndir: W\nip: 5 2\n---\n  S\nSM3 -?.\\S`Me\n  :M>2S$B8yCM\n   >  4 S-[MM\n", "name: morph2-still\n# map-elites run morph2, slot 1-0-0 (still), was m247-95084 (gen 247, parents m242-93180+dir)\n# fitness 1.94; 19W of 60; per game: 1.27 bomb hits, 0.00 poison writes, 4.97 pickups; left home in 83% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 17% of games\ndir: W\nip: 9 3\n---\n      .\n  v  MB\nAX>C2S|$    W$\n >^LA5>$$:Mem+\n     T\n"], seed: 1110 }, final: 1873742159, ticks: 2e3 }, { case: { sources: ["name: evo5-1\n# evolved: run evo5, was g138-17128 (parents g137-17041\xD7g137-17108)\n# held-out vs benchmarks: 50/110 wins; bomber 2-2, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-1, viper 4-1, evo2-2 5-0, evo3-1 8-0, evo4-1 4-2, evo4-2 3-3, evo4-3 2-4\ndir: W\nip: 10 1\n---\n .G$3-CC3-\n:M>2S$B8CyM\ner     XM-@d\n=\n", "name: morph1-still\n# map-elites run morph1, slot 2-0-0 (still), was m249-95875 (gen 249, parents m150-57657+point)\n# fitness 2.09; 13W of 30; per game: 0.33 bomb hits, 0.87 poison writes, 2.53 pickups; left home in 93% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 0% of games\ndir: E\nip: 11 3\n---\n      .\n  v  +>oo'@W B\n:$>C2S|   B-BB\n  ^   >$$:Mem+\n"], seed: 1139 }, final: 1394506251, ticks: 2e3 }, { case: { sources: ["name: evo5-2\n# evolved: run evo5, was g148-18472 (parents g147-18327+remove)\n# held-out vs benchmarks: 53/110 wins; bomber 5-1, gatherer 10-0, roamer 5-1, stalker 5-1, turtle 5-2, viper 5-1, evo2-2 6-0, evo3-1 5-1, evo4-1 3-3, evo4-2 2-4, evo4-3 2-4\ndir: E\nip: 6 1\n---\n    y^MWFS_ :\n6>28M>2S$B8CyMC\n    F4 M   R$S\n", "name: map4-poisoner\n# map-elites run map4, slot 3-4-3 (poisoner), was m296-113891 (gen 296, parents m289-111025+)\n# fitness 2.19; 51W of 108; per game: 0.89 bomb hits, 20.75 poison writes, 7.06 pickups; left home in 100% of games\ndir: W\nip: 1 2\n---\n       .\nM  v  +>oo'@W B\n:S$>C2S|     W$\n   ^   >$$:Mem+\n"], seed: 1168 }, final: 1425278261, ticks: 2e3 }, { case: { sources: ["name: evo5-3\n# evolved: run evo5, was g143-17853 (parents g142-17652+remove)\n# held-out vs benchmarks: 47/110 wins; bomber 3-1, gatherer 8-2, roamer 3-1, stalker 3-1, turtle 6-0, viper 2-2, evo2-2 7-0, evo3-1 5-0, evo4-1 4-3, evo4-2 3-4, evo4-3 3-4\ndir: W\nip: 3 1\n---\n y$M  ^_ :W-\n:M>2S$B8CyMC\n y4 T <-4$>\n", "name: map4-bomber\n# map-elites run map4, slot 1-4-3 (bomber), was m298-114704 (gen 298, parents m295-113526+point)\n# fitness 2.90; 20W of 36; per game: 4.19 bomb hits, 0.00 poison writes, 4.69 pickups; left home in 89% of games\ndir: E\nip: 3 1\n---\n v  WBoo'@W .\n$>C2S|     W$\n ^<  >$$:Mem+\n"], seed: 1197 }, final: 850267669, ticks: 2e3 }, { case: { sources: ["name: evo6-1\n# evolved: run evo6, was g143-17847 (parents g142-17720\xD7g142-17670)\n# held-out vs benchmarks: 65/140 wins; bomber 4-1, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-0, viper 4-1, evo2-2 7-0, evo3-1 6-0, evo4-1 2-3, evo4-2 5-1, evo4-3 3-3, evo5-1 4-2, evo5-2 4-3, evo5-3 4-2\ndir: W\nip: 4 1\n---\nCo yMe_ de y\n :M>2S$B8CyMC\n W.^: T@   /\n", "name: map3-none\n# map-elites run map3, slot 0-4-2 (none), was m199-76527 (gen 199, parents m192-73841+point)\n# fitness 2.34; 30W of 46; per game: 0.00 bomb hits, 0.00 poison writes, 7.20 pickups; left home in 67% of games\ndir: E\nip: 7 3\n---\n  M\n>#ov  B>oo'\n|\\ >m2S|\n>d$CMem+\n"], seed: 1226 }, final: 1773945099, ticks: 2e3 }, { case: { sources: ["name: evo6-2\n# evolved: run evo6, was g147-18251 (parents g146-18184\xD7g146-18116)\n# held-out vs benchmarks: 61/140 wins; bomber 2-3, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-0, viper 4-1, evo2-2 6-0, evo3-1 6-0, evo4-1 4-1, evo4-2 4-1, evo4-3 4-1, evo5-1 1-4, evo5-2 4-2, evo5-3 4-2\ndir: W\nip: 4 2\n---\n5\nCo yM \\-+e y\n :M>2S$B8CyMC\n C.^   @+ $S\n", "name: map3-mixed\n# map-elites run map3, slot 2-3-3 (mixed), was m197-75976 (gen 197, parents m189-72802+)\n# fitness 2.01; 19W of 46; per game: 0.04 bomb hits, 0.04 poison writes, 2.46 pickups; left home in 80% of games\ndir: E\nip: 0 2\n---\n    .\nv   >oo'@WC\\$:MB\n>C2S|      $\n^   >$$:Mem+\nM\n"], seed: 1255 }, final: 3559646842, ticks: 2e3 }, { case: { sources: ["name: evo6-3\n# evolved: run evo6, was g136-16889 (parents g135-16802+remove)\n# held-out vs benchmarks: 61/140 wins; bomber 3-2, gatherer 7-3, roamer 4-1, stalker 4-1, turtle 4-1, viper 4-1, evo2-2 5-0, evo3-1 6-0, evo4-1 2-5, evo4-2 4-2, evo4-3 3-3, evo5-1 4-2, evo5-2 5-2, evo5-3 6-2\ndir: W\nip: 4 1\n---\nCo RCr_%de y\n :M>2S$B8CyMC\n CM[ v @  e_\n", "name: map3-mixed\n# map-elites run map3, slot 2-3-3 (mixed), was m197-75976 (gen 197, parents m189-72802+)\n# fitness 2.01; 19W of 46; per game: 0.04 bomb hits, 0.04 poison writes, 2.46 pickups; left home in 80% of games\ndir: E\nip: 0 2\n---\n    .\nv   >oo'@WC\\$:MB\n>C2S|      $\n^   >$$:Mem+\nM\n"], seed: 1284 }, final: 292842551, ticks: 2e3 }, { case: { sources: ["name: map1-bomber\n# map-elites run map1 (stopped at gen ~127, stagnant), slot 1-3-3 (bomber), was m14-5507 (gen 14)\n# fitness 3.46; per game: 5.00 bomb hits, 0.00 poison writes, 2.00 pickups; left home in 91% of games\ndir: W\nip: 4 2\n---\n$\nFB -  rS\\+!:\n :M>2S$B8yCM\n  4r^   >$$:M\n", "name: map3-none\n# map-elites run map3, slot 0-4-2 (none), was m199-76527 (gen 199, parents m192-73841+point)\n# fitness 2.34; 30W of 46; per game: 0.00 bomb hits, 0.00 poison writes, 7.20 pickups; left home in 67% of games\ndir: E\nip: 7 3\n---\n  M\n>#ov  B>oo'\n|\\ >m2S|\n>d$CMem+\n"], seed: 1313 }, final: 218864970, ticks: 2e3 }, { case: { sources: ["name: map1-none\n# map-elites run map1 (stopped at gen ~127, stagnant), slot 0-3-2 (none), was m98-37682 (gen 98)\n# fitness 2.23; per game: 0.00 bomb hits, 0.00 poison writes, 3.62 pickups; left home in 71% of games\ndir: E\nip: 0 2\n---\n9\nv\n8yCM\n>$$9M$$vMS!+\n", "name: map4-bomber\n# map-elites run map4, slot 1-4-3 (bomber), was m298-114704 (gen 298, parents m295-113526+point)\n# fitness 2.90; 20W of 36; per game: 4.19 bomb hits, 0.00 poison writes, 4.69 pickups; left home in 89% of games\ndir: E\nip: 3 1\n---\n v  WBoo'@W .\n$>C2S|     W$\n ^<  >$$:Mem+\n"], seed: 1342 }, final: 2600899406, ticks: 2e3 }, { case: { sources: ["name: map2-bomber\n# map-elites run map2, slot 1-3-3 (bomber), was m248-95485 (gen 248, parents m247-94854+point)\n# fitness 2.67; 45W of 72; per game: 3.36 bomb hits, 0.00 poison writes, 2.19 pickups; left home in 86% of games\ndir: W\nip: 14 2\n---\n\\\nMFB ^y  f-fe\n  :M>>2S$B8CyMC\n   4r^  >$S $\n", "name: map4-poisoner\n# map-elites run map4, slot 3-4-3 (poisoner), was m296-113891 (gen 296, parents m289-111025+)\n# fitness 2.19; 51W of 108; per game: 0.89 bomb hits, 20.75 poison writes, 7.06 pickups; left home in 100% of games\ndir: W\nip: 1 2\n---\n       .\nM  v  +>oo'@W B\n:S$>C2S|     W$\n   ^   >$$:Mem+\n"], seed: 1371 }, final: 3951944527, ticks: 2e3 }, { case: { sources: ["name: map2-mixed\n# map-elites run map2, slot 2-3-3 (mixed), was m248-95250 (gen 248, parents m126-48739+)\n# fitness 1.97; 34W of 72; per game: 0.08 bomb hits, 0.14 poison writes, 3.36 pickups; left home in 89% of games\ndir: S\nip: 0 2\n---\n    .\nv   >oo'@WT\\$:MB\n>C2S|      $\n^   >$$:Mem+\nM\n", "name: morph1-still\n# map-elites run morph1, slot 2-0-0 (still), was m249-95875 (gen 249, parents m150-57657+point)\n# fitness 2.09; 13W of 30; per game: 0.33 bomb hits, 0.87 poison writes, 2.53 pickups; left home in 93% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 0% of games\ndir: E\nip: 11 3\n---\n      .\n  v  +>oo'@W B\n:$>C2S|   B-BB\n  ^   >$$:Mem+\n"], seed: 1400 }, final: 2169872713, ticks: 2e3 }, { case: { sources: ["name: map2-none\n# map-elites run map2, slot 0-3-3 (none), was m249-95832 (gen 249, parents m245-94228+point)\n# fitness 2.03; 21W of 36; per game: 0.00 bomb hits, 0.00 poison writes, 3.56 pickups; left home in 97% of games\ndir: S\nip: 0 1\n---\n    .\nv   >oo'@WT\\$vMB\n>C2S|      $\n^   >$$:Mem+\nM\n", "name: morph2-still\n# map-elites run morph2, slot 1-0-0 (still), was m247-95084 (gen 247, parents m242-93180+dir)\n# fitness 1.94; 19W of 60; per game: 1.27 bomb hits, 0.00 poison writes, 4.97 pickups; left home in 83% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 17% of games\ndir: W\nip: 9 3\n---\n      .\n  v  MB\nAX>C2S|$    W$\n >^LA5>$$:Mem+\n     T\n"], seed: 1429 }, final: 2480341722, ticks: 2e3 }, { case: { sources: ["name: map2-poisoner\n# map-elites run map2, slot 3-3-3 (poisoner), was m249-95710 (gen 249, parents m242-92949\xD7m192-73730)\n# fitness 2.28; 22W of 36; per game: 0.03 bomb hits, 0.14 poison writes, 3.53 pickups; left home in 97% of games\ndir: E\nip: 0 1\n---\nv B >oo'@W o$:M\n>C2S|     +$.\n^   >$$:Mem+\nM\n", "name: morph4-twitch\n# map-elites run morph4, slot 0-1-1 (twitch), was m397-152563 (gen 397, parents m37-14565\xD7m395-151787)\n# fitness 2.38; 18W of 28; per game: 0.00 bomb hits, 0.00 poison writes, 8.50 pickups; left home in 29% of games\n# shape changes 5.7 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 11 2\n---\nd   *.\nCv TCB6-\n9>C2S|     3@C\n ^ SA>$$:Mem+\n"], seed: 1458 }, final: 3154226641, ticks: 2e3 }, { case: { sources: ["name: map3-mixed\n# map-elites run map3, slot 2-3-3 (mixed), was m197-75976 (gen 197, parents m189-72802+)\n# fitness 2.01; 19W of 46; per game: 0.04 bomb hits, 0.04 poison writes, 2.46 pickups; left home in 80% of games\ndir: E\nip: 0 2\n---\n    .\nv   >oo'@WC\\$:MB\n>C2S|      $\n^   >$$:Mem+\nM\n", "name: morph1-amoeba\n# map-elites run morph1, slot 1-4-2 (amoeba), was m158-60820 (gen 158, parents m139-53708+point)\n# fitness 2.08; 932W of 2730; per game: 1.77 bomb hits, 0.00 poison writes, 3.13 pickups; left home in 97% of games\n# shape changes 205.0 cells/game; squeezed through a narrow passage in 53% of games\ndir: W\nip: 12 1\n---\n  v 2+BBA'@\\\nA$>C2S|     2B\n >^ A >$$:Mem+\n"], seed: 1487 }, final: 2232943437, ticks: 2e3 }, { case: { sources: ["name: map3-none\n# map-elites run map3, slot 0-4-2 (none), was m199-76527 (gen 199, parents m192-73841+point)\n# fitness 2.34; 30W of 46; per game: 0.00 bomb hits, 0.00 poison writes, 7.20 pickups; left home in 67% of games\ndir: E\nip: 7 3\n---\n  M\n>#ov  B>oo'\n|\\ >m2S|\n>d$CMem+\n", "name: morph2-twitch\n# map-elites run morph2, slot 1-1-2 (twitch), was m237-91376 (gen 237, parents m235-90361+point,point)\n# fitness 1.95; 100W of 300; per game: 2.40 bomb hits, 0.00 poison writes, 9.77 pickups; left home in 93% of games\n# shape changes 3.3 cells/game; squeezed through a narrow passage in 50% of games\ndir: E\nip: 2 2\n---\n      .\n  $  CBBAG@  B\nA7>C2S|     W$\n >^ AS>$$:Mem+\n"], seed: 1516 }, final: 1948322041, ticks: 2e3 }, { case: { sources: ["name: map4-bomber\n# map-elites run map4, slot 1-4-3 (bomber), was m298-114704 (gen 298, parents m295-113526+point)\n# fitness 2.90; 20W of 36; per game: 4.19 bomb hits, 0.00 poison writes, 4.69 pickups; left home in 89% of games\ndir: E\nip: 3 1\n---\n v  WBoo'@W .\n$>C2S|     W$\n ^<  >$$:Mem+\n", "name: morph1-morph\n# map-elites run morph1, slot 1-2-0 (morph), was m248-95532 (gen 248, parents m242-93223+dupe)\n# fitness 2.42; 12W of 30; per game: 2.90 bomb hits, 0.00 poison writes, 2.20 pickups; left home in 97% of games\n# shape changes 16.8 cells/game; squeezed through a narrow passage in 13% of games\ndir: W\nip: 6 2\n---\n v 2+BBA2@\\\n >C2S|     !B\n>^ AA>$$:Mem+\n>\n"], seed: 1545 }, final: 110092381, ticks: 2e3 }, { case: { sources: ["name: map4-mixed\n# map-elites run map4, slot 2-3-3 (mixed), was m297-114224 (gen 297, parents m286-109904+)\n# fitness 2.25; 27W of 72; per game: 2.28 bomb hits, 0.72 poison writes, 2.97 pickups; left home in 97% of games\ndir: E\nip: 14 2\n---\n       .\nM  v  +>oo'@W B\n:M$>C2S|     W$\n   ^   >$$:Mem+\n", "name: morph4-still\n# map-elites run morph4, slot 1-0-1 (still), was m397-152498 (gen 397, parents m393-151022+point,remove,add,ip)\n# fitness 2.21; 30W of 56; per game: 0.21 bomb hits, 0.00 poison writes, 7.96 pickups; left home in 29% of games\n# shape changes 0.0 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 5 1\n---\n     M.\n Cv TCBB      ^\nT7>2CS|     3@C\n >^ A >$$:Mem+\n"], seed: 1574 }, final: 3962898892, ticks: 2e3 }, { case: { sources: ["name: map4-poisoner\n# map-elites run map4, slot 3-4-3 (poisoner), was m296-113891 (gen 296, parents m289-111025+)\n# fitness 2.19; 51W of 108; per game: 0.89 bomb hits, 20.75 poison writes, 7.06 pickups; left home in 100% of games\ndir: W\nip: 1 2\n---\n       .\nM  v  +>oo'@W B\n:S$>C2S|     W$\n   ^   >$$:Mem+\n", "name: morph4-morph\n# map-elites run morph4, slot 1-2-1 (morph), was m397-152481 (gen 397, parents m391-150471+swap,point,point)\n# fitness 2.51; 36W of 56; per game: 0.29 bomb hits, 0.00 poison writes, 8.79 pickups; left home in 39% of games\n# shape changes 20.6 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 36%\ndir: W\nip: 11 3\n---\n    <\nd   >.\nCv TCB<-\n9>C2S|     3@C\n ^ A >=$:Mem+\n"], seed: 1603 }, final: 1424372153, ticks: 2e3 }, { case: { sources: ["name: morph1-morph\n# map-elites run morph1, slot 1-2-0 (morph), was m248-95532 (gen 248, parents m242-93223+dupe)\n# fitness 2.42; 12W of 30; per game: 2.90 bomb hits, 0.00 poison writes, 2.20 pickups; left home in 97% of games\n# shape changes 16.8 cells/game; squeezed through a narrow passage in 13% of games\ndir: W\nip: 6 2\n---\n v 2+BBA2@\\\n >C2S|     !B\n>^ AA>$$:Mem+\n>\n", "name: morph4-still\n# map-elites run morph4, slot 1-0-1 (still), was m397-152498 (gen 397, parents m393-151022+point,remove,add,ip)\n# fitness 2.21; 30W of 56; per game: 0.21 bomb hits, 0.00 poison writes, 7.96 pickups; left home in 29% of games\n# shape changes 0.0 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 5 1\n---\n     M.\n Cv TCBB      ^\nT7>2CS|     3@C\n >^ A >$$:Mem+\n"], seed: 1632 }, final: 47682641, ticks: 2e3 }, { case: { sources: ["name: morph1-twitch\n# map-elites run morph1, slot 1-1-0 (twitch), was m248-95312 (gen 248, parents m246-94544+remove)\n# fitness 2.20; 10W of 30; per game: 2.80 bomb hits, 0.00 poison writes, 2.30 pickups; left home in 77% of games\n# shape changes 7.6 cells/game; squeezed through a narrow passage in 13% of games\ndir: W\nip: 11 2\n---\n v  +BBA2@\n >C2S|     !B\n>^ A >$$:Mem+\n", "name: morph2-twitch\n# map-elites run morph2, slot 1-1-2 (twitch), was m237-91376 (gen 237, parents m235-90361+point,point)\n# fitness 1.95; 100W of 300; per game: 2.40 bomb hits, 0.00 poison writes, 9.77 pickups; left home in 93% of games\n# shape changes 3.3 cells/game; squeezed through a narrow passage in 50% of games\ndir: E\nip: 2 2\n---\n      .\n  $  CBBAG@  B\nA7>C2S|     W$\n >^ AS>$$:Mem+\n"], seed: 1661 }, final: 30380904, ticks: 2e3 }, { case: { sources: ["name: morph2-ooze\n# map-elites run morph2, slot 1-3-2 (ooze), was m244-93862 (gen 244, parents m203-78037+dir)\n# fitness 2.09; 51W of 120; per game: 1.37 bomb hits, 0.00 poison writes, 3.63 pickups; left home in 97% of games\n# shape changes 110.9 cells/game; squeezed through a narrow passage in 50% of games\ndir: E\nip: 6 3\n---\nd   T.\n+vM-CB7T\n >C2S|     ]7C\n ^ AA>$$:Mem+\n", "name: morph4-twitch\n# map-elites run morph4, slot 0-1-1 (twitch), was m397-152563 (gen 397, parents m37-14565\xD7m395-151787)\n# fitness 2.38; 18W of 28; per game: 0.00 bomb hits, 0.00 poison writes, 8.50 pickups; left home in 29% of games\n# shape changes 5.7 cells/game; squeezed into a narrow passage in 0% of games; whole body into another room in 29%\ndir: W\nip: 11 2\n---\nd   *.\nCv TCB6-\n9>C2S|     3@C\n ^ SA>$$:Mem+\n"], seed: 1690 }, final: 3948016463, ticks: 2e3 }, { case: { sources: ["name: evo2-3\n# evolved: run evo2, was g133-16531 (parents g132-16407+point,remove)\n# held-out vs benchmarks: 22/50 wins; bomber 7-1, gatherer 2-4, roamer 2-4, stalker 6-2, turtle 5-0\ndir: W\nip: 3 2\n---\n B+vF|B3<7\nB^`?|T\\SB-\n 7 CBTM?:\n", "name: morph2-still\n# map-elites run morph2, slot 1-0-0 (still), was m247-95084 (gen 247, parents m242-93180+dir)\n# fitness 1.94; 19W of 60; per game: 1.27 bomb hits, 0.00 poison writes, 4.97 pickups; left home in 83% of games\n# shape changes 0.0 cells/game; squeezed through a narrow passage in 17% of games\ndir: W\nip: 9 3\n---\n      .\n  v  MB\nAX>C2S|$    W$\n >^LA5>$$:Mem+\n     T\n"], seed: 1719 }, final: 3300457446, ticks: 2e3 }, { case: { sources: ["name: rand15\ndir: S\nip: 3 1\n---\n  <m8\n   \\\n=LC6AM\n  CT\n  4M\n", "name: morph2-amoeba\n# map-elites run morph2, slot 1-4-0 (amoeba), was m247-95104 (gen 247, parents m236-90899+point)\n# fitness 2.01; 19W of 60; per game: 1.90 bomb hits, 0.00 poison writes, 5.73 pickups; left home in 87% of games\n# shape changes 379.1 cells/game; squeezed through a narrow passage in 7% of games\ndir: W\nip: 6 3\n---\n6   *.\nCv -CBBT\n9>C2S|     3vC\n ^ AA>$$:Mem+\n"], seed: 1748 }, final: 2340355700, ticks: 2e3 }, { case: { sources: ["name: mut17\ndir: W\nip: 3 2\n---\n   T7\n  B+vF|B3<7\n_B^`?|T\\SB-\n  7 CBTM :\n", "name: rand17\ndir: N\nip: 3 2\n---\n>Te:_\n  +4?\n3.KL\n 6C\\\n  #T$\n"], seed: 1777 }, final: 2733624005, ticks: 2e3 }, { case: { sources: ["name: mut33\ndir: W\nip: 3 2\n---\n    .   C\nv   >oo'@WT\\$:MB\n>C2S|      $\n^   >$$: ee+\nM\n", "name: rand27\ndir: S\nip: 3 2\n---\n  %`\n  0A\nW#%<5!\n"], seed: 1806 }, final: 3673348208, ticks: 2e3 }, { case: { sources: ["name: evo6-3\n# evolved: run evo6, was g136-16889 (parents g135-16802+remove)\n# held-out vs benchmarks: 61/140 wins; bomber 3-2, gatherer 7-3, roamer 4-1, stalker 4-1, turtle 4-1, viper 4-1, evo2-2 5-0, evo3-1 6-0, evo4-1 2-5, evo4-2 4-2, evo4-3 3-3, evo5-1 4-2, evo5-2 5-2, evo5-3 6-2\ndir: W\nip: 4 1\n---\nCo RCr_%de y\n :M>2S$B8CyMC\n CM[ v @  e_\n", "name: map2-none\n# map-elites run map2, slot 0-3-3 (none), was m249-95832 (gen 249, parents m245-94228+point)\n# fitness 2.03; 21W of 36; per game: 0.00 bomb hits, 0.00 poison writes, 3.56 pickups; left home in 97% of games\ndir: S\nip: 0 1\n---\n    .\nv   >oo'@WT\\$vMB\n>C2S|      $\n^   >$$:Mem+\nM\n"], seed: 1835 }, final: 1349031961, ticks: 2e3 }, { case: { sources: ["name: mut5\ndir: E\nip: 1 0\n---\n C6S$TA\nTS S\n", "name: map2-bomber\n# map-elites run map2, slot 1-3-3 (bomber), was m248-95485 (gen 248, parents m247-94854+point)\n# fitness 2.67; 45W of 72; per game: 3.36 bomb hits, 0.00 poison writes, 2.19 pickups; left home in 86% of games\ndir: W\nip: 14 2\n---\n\\\nMFB ^y  f-fe\n  :M>>2S$B8CyMC\n   4r^  >$S $\n", "name: rand29\ndir: N\nip: 2 2\n---\n   1\nvC<T^A\n 8A@e|\n", "name: map1-none\n# map-elites run map1 (stopped at gen ~127, stagnant), slot 0-3-2 (none), was m98-37682 (gen 98)\n# fitness 2.23; per game: 0.00 bomb hits, 0.00 poison writes, 3.62 pickups; left home in 71% of games\ndir: E\nip: 0 2\n---\n9\nv\n8yCM\n>$$9M$$vMS!+\n"], seed: 1864 }, final: 4194166820, ticks: 2e3 }, { case: { sources: ["name: mut30\ndir: W\nip: 4 2\n---\n<\nFB -  rS_+!3\n :M>2S$B8yCM\n  4r^   >$$:M\n        B\n", "name: rand21\ndir: W\nip: 4 2\n---\n   ?\n  :$e\n  2Lo\nWS@TM\n  TT\n", "name: amoeba-g\n# morph4-amoeba with one cell changed (e \u2192 G): grows fat as it oozes\ndir: W\nip: 4 4\n---\n  m\n  *T\n  1WBCs\n  +=\\M\n +GmLA\nR+dWCmLC\n   L=/:\n   4\n", "name: rand16\ndir: S\nip: 3 1\n---\n 8\nWWFCB\n :T|\n  >]\n   +\n"], seed: 1893 }, final: 1796336964, ticks: 2e3 }, { case: { sources: ["name: rand20\ndir: W\nip: 3 2\n---\n   Ao\n oCTT\nL.TGA.\n? ./2\n", "name: evo5-1\n# evolved: run evo5, was g138-17128 (parents g137-17041\xD7g137-17108)\n# held-out vs benchmarks: 50/110 wins; bomber 2-2, gatherer 8-2, roamer 4-1, stalker 4-1, turtle 6-1, viper 4-1, evo2-2 5-0, evo3-1 8-0, evo4-1 4-2, evo4-2 3-3, evo4-3 2-4\ndir: W\nip: 10 1\n---\n .G$3-CC3-\n:M>2S$B8CyM\ner     XM-@d\n=\n", "name: mut7\ndir: E\nip: 1 1\n---\n v   >oo'@WT\\$:M\n_>C2Sm     2\n ^   >$$:Me!+\n", "name: map2-poisoner\n# map-elites run map2, slot 3-3-3 (poisoner), was m249-95710 (gen 249, parents m242-92949\xD7m192-73730)\n# fitness 2.28; 22W of 36; per game: 0.03 bomb hits, 0.14 poison writes, 3.53 pickups; left home in 97% of games\ndir: E\nip: 0 1\n---\nv B >oo'@W o$:M\n>C2S|     +$.\n^   >$$:Mem+\nM\n"], seed: 1922 }, final: 2587173587, ticks: 2e3 }, { case: { sources: ["name: rand20\ndir: W\nip: 3 2\n---\n   Ao\n oCTT\nL.TGA.\n? ./2\n", "name: mut4\ndir: S\nip: 0 1\n---\no\nC6\\$:M\n", "name: map2-bomber\n# map-elites run map2, slot 1-3-3 (bomber), was m248-95485 (gen 248, parents m247-94854+point)\n# fitness 2.67; 45W of 72; per game: 3.36 bomb hits, 0.00 poison writes, 2.19 pickups; left home in 86% of games\ndir: W\nip: 14 2\n---\n\\\nMFB ^y  f-fe\n  :M>>2S$B8CyMC\n   4r^  >$S $\n", "name: evo1-3\n# evolved: run evo1, was g94-8652 (parents g90-8298\xD7g93-8634)\n# held-out vs benchmarks: 46/50 wins; bomber 8-2, gatherer 10-0, roamer 10-0, stalker 8-2, turtle 10-0\ndir: E\nip: 12 2\n---\n S :mL\n^>:fS|  \\T\n ^y m>$$CM2eBR\n"], seed: 1951 }, final: 3634306947, ticks: 2e3 }, { case: { sources: ["name: rand18\ndir: S\nip: 3 3\n---\n     T-\n T.<  C\n GfMC.S\n XA\\D\nS|m9\n"], seed: 1980 }, final: 1112347107, ticks: 2e3 }];

// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBWDAK";
var CODE = {};
for (let i = 0; i < GLYPHS.length; i++) CODE[GLYPHS[i]] = i;
function glyphOf(code) {
  return GLYPHS[code] ?? ".";
}
var DX = [1, 0, -1, 0];
var DY = [0, 1, 0, -1];
var DIR_NAMES = ["E", "S", "W", "N"];
var COST = { M: 2, G: 2, B: 4, W: 3 };
var T_NOTHING = 0;
var T_WALL = 1;
var T_ENEMY = 2;
var T_DEBRIS = 3;
var T_SIZE = 4;
var T_SPEED = 5;
var T_RESOURCE = 6;

// src/sim/warrior-file.ts
function parseWarrior(text, fallbackName = "warrior") {
  const lines = text.replace(/\r/g, "").split("\n");
  const sep = lines.findIndex((l) => l.trim() === "---");
  if (sep < 0) throw new Error(`${fallbackName}: missing '---' line between header and body`);
  const header = {};
  for (const l of lines.slice(0, sep)) {
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const m = l.match(/^\s*(\w+)\s*:\s*(.*)$/);
    if (m) header[m[1].toLowerCase()] = m[2].trim();
  }
  const grid = lines.slice(sep + 1);
  while (grid.length && !grid[grid.length - 1].trim()) grid.pop();
  const cells = [];
  let width = 0;
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === " ") continue;
      if (!(ch in CODE)) throw new Error(`${fallbackName}: unknown glyph '${ch}' at ${x},${y}`);
      cells.push({ x, y, code: CODE[ch] });
      width = Math.max(width, x + 1);
    }
  });
  if (!cells.length) throw new Error(`${fallbackName}: empty body`);
  let ip = { x: cells[0].x, y: cells[0].y };
  if (header.ip) {
    const [x, y] = header.ip.split(/[\s,]+/).map(Number);
    ip = { x, y };
    if (!cells.some((c) => c.x === x && c.y === y)) throw new Error(`${fallbackName}: ip ${x},${y} is not a cell`);
  }
  const dir = header.dir ? DIR_NAMES.indexOf(header.dir.toUpperCase()) : 0;
  if (dir < 0) throw new Error(`${fallbackName}: bad dir '${header.dir}'`);
  return { name: header.name || fallbackName, dir, ip, cells, width, height: grid.length, source: text, realm: header.realm };
}

// src/sim/rng.ts
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// src/sim/board.ts
var FLOOR = 0;
var WALL = 1;
var BOARD_W = 64;
var BOARD_H = 40;
function makeBoard(seed) {
  for (let k = 0; ; k++) {
    const b = makeRooms(seed, k);
    if (b) return b;
  }
}
function canvas(w, h) {
  const terrain = new Uint8Array(w * h).fill(WALL);
  const carve = (r) => {
    for (const [mx, my] of [[false, false], [true, false], [false, true], [true, true]]) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const cx = mx ? w - 1 - x : x;
          const cy = my ? h - 1 - y : y;
          if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1) terrain[cy * w + cx] = FLOOR;
        }
      }
    }
  };
  const spawns = [];
  const spawnAll = (x, y, kind) => {
    for (const [px, py] of [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]]) {
      if (!spawns.some((s) => s.x === px && s.y === py)) spawns.push({ x: px, y: py, kind });
    }
  };
  const mirrorRect = (r, mx, my) => ({
    x: mx ? w - r.x - r.w : r.x,
    y: my ? h - r.y - r.h : r.y,
    w: r.w,
    h: r.h
  });
  const startsFrom = (r) => [mirrorRect(r, false, false), mirrorRect(r, true, false), mirrorRect(r, true, true), mirrorRect(r, false, true)];
  return { terrain, carve, spawns, spawnAll, startsFrom };
}
var WIDTHS = [1, 1, 2, 2, 3, 4];
function split(rng, total, n, first, min) {
  if (n === 1) return [total];
  const a = randInt(rng, first, Math.max(first, total - min * (n - 1)));
  const rest = total - a;
  const parts = [a];
  let left = rest;
  for (let i = 1; i < n - 1; i++) {
    const p = randInt(rng, min, Math.max(min, left - min * (n - 1 - i)));
    parts.push(p);
    left -= p;
  }
  parts.push(left);
  return parts;
}
function widestExit(terrain, w, r) {
  let widest = 0;
  const sides = [
    [r.x, r.y - 1, 1, 0, r.w],
    [r.x, r.y + r.h, 1, 0, r.w],
    [r.x - 1, r.y, 0, 1, r.h],
    [r.x + r.w, r.y, 0, 1, r.h]
  ];
  for (const [x0, y0, dx, dy, n] of sides) {
    let run2 = 0;
    for (let k = 0; k < n; k++) {
      run2 = terrain[(y0 + k * dy) * w + x0 + k * dx] === FLOOR ? run2 + 1 : 0;
      if (run2 > widest) widest = run2;
    }
  }
  return widest;
}
function makeRooms(seed, attempt) {
  const w = BOARD_W, h = BOARD_H, hw = w / 2, hh = h / 2;
  const rng = makeRng(seed * 7919 + attempt * 104729 ^ 5369127);
  const { terrain, carve, spawns, spawnAll, startsFrom } = canvas(w, h);
  const qcols = randInt(rng, 2, 3), qrows = randInt(rng, 1, 2);
  const colW = split(rng, hw - 1, qcols, 18, 7);
  const rowH = split(rng, hh - 1, qrows, 10, 6);
  const rooms = [];
  let y0 = 1;
  for (let r = 0; r < qrows; r++) {
    rooms.push([]);
    let x0 = 1;
    for (let c = 0; c < qcols; c++) {
      const cw = colW[c], ch = rowH[r];
      const start = r === 0 && c === 0;
      const rw = start ? randInt(rng, 16, Math.max(16, cw - 2)) : randInt(rng, Math.max(4, Math.floor(cw * 0.4)), Math.max(4, cw - 3));
      const rh = start ? randInt(rng, Math.min(8, ch - 2), ch - 2) : randInt(rng, Math.max(3, Math.floor(ch * 0.4)), Math.max(3, ch - 3));
      const room = { x: x0 + randInt(rng, 0, cw - rw - 1) + (start ? 1 : 0), y: y0 + randInt(rng, 0, ch - rh - 1) + (start ? 1 : 0), w: rw, h: rh };
      if (start) {
        room.x = Math.min(room.x, x0 + cw - rw - 1);
        room.y = Math.min(room.y, y0 + ch - rh - 1);
      }
      if (c === qcols - 1 && rng() < 0.25 && !start) room.w = hw - room.x;
      if (r === qrows - 1 && rng() < 0.25 && !start) room.h = hh - room.y;
      rooms[r].push(room);
      carve(room);
      x0 += cw;
    }
    y0 += rowH[r];
  }
  const center = (a) => ({ x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) });
  const corridor = (a, b, cw) => {
    const ylo = Math.max(a.y, b.y), yhi = Math.min(a.y + a.h, b.y + b.h) - cw;
    const xlo = Math.max(a.x, b.x), xhi = Math.min(a.x + a.w, b.x + b.w) - cw;
    if (yhi >= ylo && (b.x >= a.x + a.w || a.x >= b.x + b.w)) {
      const y = randInt(rng, ylo, yhi);
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      carve({ x: l.x + l.w, y, w: r.x - (l.x + l.w), h: cw });
    } else if (xhi >= xlo && (b.y >= a.y + a.h || a.y >= b.y + b.h)) {
      const x = randInt(rng, xlo, xhi);
      const [t, u] = a.y < b.y ? [a, b] : [b, a];
      carve({ x, y: t.y + t.h, w: cw, h: u.y - (t.y + t.h) });
    } else {
      const pa = center(a), pb = center(b);
      carve({ x: Math.min(pa.x, pb.x), y: pa.y, w: Math.abs(pa.x - pb.x) + cw, h: cw });
      carve({ x: pb.x, y: Math.min(pa.y, pb.y), w: cw, h: Math.abs(pa.y - pb.y) + cw });
    }
  };
  const key = (r, c) => r * 10 + c;
  const seen = /* @__PURE__ */ new Set([key(0, 0)]);
  const stack = [[0, 0]];
  const edges = /* @__PURE__ */ new Set();
  const startExits = [];
  const link = (r1, c1, r2, c2) => {
    const id = [key(r1, c1), key(r2, c2)].sort().join("-");
    if (edges.has(id)) return;
    edges.add(id);
    let cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
    if (r1 === 0 && c1 === 0 || r2 === 0 && c2 === 0) {
      cw = Math.min(cw, 2);
      startExits.push(cw);
    }
    corridor(rooms[r1][c1], rooms[r2][c2], cw);
  };
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].filter(([a2, b2]) => a2 >= 0 && b2 >= 0 && a2 < qrows && b2 < qcols && !seen.has(key(a2, b2)));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [a, b] = next[Math.floor(rng() * next.length)];
    seen.add(key(a, b));
    link(r, c, a, b);
    stack.push([a, b]);
  }
  for (let r = 0; r < qrows; r++) {
    for (let c = 0; c < qcols; c++) {
      if (c + 1 < qcols && rng() < 0.4) link(r, c, r, c + 1);
      if (r + 1 < qrows && rng() < 0.4) link(r, c, r + 1, c);
    }
  }
  if (!startExits.some((cw) => cw >= 2)) {
    const [r, c] = qcols > 1 ? [0, 1] : [1, 0];
    corridor(rooms[0][0], rooms[r][c], 2);
  }
  const crossRight = rooms.map((row) => row[qcols - 1]);
  const crossDown = rooms[qrows - 1];
  const cross = (list, horizontal) => {
    let any = list.some((a) => horizontal ? a.x + a.w >= hw : a.y + a.h >= hh);
    list.forEach((a, i) => {
      const touches = horizontal ? a.x + a.w >= hw : a.y + a.h >= hh;
      if (touches || any && rng() < 0.5 && i !== list.length - 1) return;
      const cw = a === rooms[0][0] ? Math.min(2, WIDTHS[Math.floor(rng() * WIDTHS.length)]) : WIDTHS[Math.floor(rng() * WIDTHS.length)];
      if (horizontal) carve({ x: a.x + a.w, y: randInt(rng, a.y, a.y + a.h - Math.min(cw, a.h)), w: hw - (a.x + a.w), h: cw });
      else carve({ x: randInt(rng, a.x, a.x + a.w - Math.min(cw, a.w)), y: a.y + a.h, w: cw, h: hh - (a.y + a.h) });
      any = true;
    });
  };
  cross(crossRight, true);
  cross(crossDown, false);
  const others = rooms.flat().filter((r) => r !== rooms[0][0]);
  const inside = (a) => ({ x: a.x + randInt(rng, 1, Math.max(1, a.w - 2)), y: a.y + randInt(rng, 1, Math.max(1, a.h - 2)) });
  for (let k = 0; k < 2; k++) {
    const p = inside(others[Math.floor(rng() * others.length)]);
    spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 1);
  }
  {
    const p = inside(others[Math.floor(rng() * others.length)]);
    spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 2);
  }
  const starts = startsFrom(rooms[0][0]);
  if (widestExit(terrain, w, starts[0]) > 2) return null;
  const reach = new Uint8Array(w * h);
  const s0 = starts[0];
  const q = [(s0.y + 1) * w + s0.x + 1];
  reach[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    for (const n of [i - 1, i + 1, i - w, i + w]) {
      if (n >= 0 && n < w * h && !reach[n] && terrain[n] === FLOOR) {
        reach[n] = 1;
        q.push(n);
      }
    }
  }
  for (const s of starts) if (!reach[(s.y + 1) * w + s.x + 1]) return null;
  for (const sp of spawns) if (!reach[sp.y * w + sp.x]) return null;
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !reach[i]) terrain[i] = WALL;
  const listed = /* @__PURE__ */ new Set();
  const allRooms = rooms.flat().flatMap((r) => {
    const hall = { x: r.x, y: r.y, w: r.x + r.w === hw ? 2 * r.w : r.w, h: r.y + r.h === hh ? 2 * r.h : r.h };
    return startsFrom(hall).filter((m) => {
      const k = `${m.x},${m.y},${m.w},${m.h}`;
      return !listed.has(k) && !!listed.add(k);
    });
  });
  return { w, h, terrain, spawns, starts, rooms: allRooms };
}
function makePlate(seed, size, bands, foodSpacing) {
  const w = size, h = size, c = (size - 1) / 2, R = size / 2 - 1;
  const rng = makeRng(seed ^ 2654435769);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const toxin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r > R) continue;
      terrain[y * w + x] = FLOOR;
      toxin[y * w + x] = Math.max(0, Math.min(bands - 1, Math.floor(r / R * (bands + 1)) - 1));
    }
  }
  const spawns = [];
  for (let y = 1; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px < w && py < h && terrain[py * w + px] === FLOOR) spawns.push({ x: px, y: py, kind: rng() < 0.2 ? 2 : 1 });
    }
  }
  const s = Math.floor(2 * R / (bands + 1));
  const start = { x: Math.round(c - s / Math.SQRT2), y: Math.round(c - s / Math.SQRT2), w: Math.floor(s * Math.SQRT2), h: Math.floor(s * Math.SQRT2) };
  return { w, h, terrain, spawns, starts: [start], rooms: [], toxin };
}
function makeIsland(seed, w, bands, foodSpacing, shallows = 0.4, calm = 0.35, depth = 0.75) {
  const h = Math.round(w * depth);
  const rng = makeRng(seed ^ 5369127);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const S = 14;
  const bedMax = h - 2, hill = Math.round((bedMax - S) * 0.12);
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const bed = (x) => bedMax - Math.round(hill * (0.5 + 0.25 * Math.sin(x / w * 6.28 * 1.3 + ph[0]) + 0.17 * Math.sin(x / w * 6.28 * 3.7 + ph[1]) + 0.08 * Math.sin(x / w * 6.28 * 9.1 + ph[2])));
  for (let x = 1; x < w - 1; x++) for (let y = S; y <= bed(x); y++) terrain[y * w + x] = FLOOR;
  const depthOf = (y) => (y - S) / (bedMax - S);
  const sharkLine = S + Math.round(shallows * (bedMax - S));
  const bayW = Math.max(18, Math.round(w * 0.06)), reefX = bayW + 1;
  const G = 4, gw = Math.ceil(w / G), gh = Math.ceil(h / G);
  let cg = new Uint8Array(gw * gh);
  const ok = (gx, gy) => gy * G >= sharkLine + 4 && gx * G > reefX + 2 && gx < gw - 1;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (ok(gx, gy) && rng() < 0.37 + 0.13 * depthOf(gy * G)) cg[gy * gw + gx] = 1;
  for (let pass = 0; pass < 4; pass++) {
    const next = cg.slice();
    for (let gy = 1; gy < gh - 1; gy++) for (let gx = 1; gx < gw - 1; gx++) {
      if (!ok(gx, gy)) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && cg[(gy + dy) * gw + gx + dx]) n++;
      next[gy * gw + gx] = n >= 5 ? 1 : n <= 3 ? 0 : cg[gy * gw + gx];
    }
    cg = next;
  }
  const rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cg[(y / G | 0) * gw + (x / G | 0)] && terrain[y * w + x] === FLOOR) rock[y * w + x] = 1;
  for (let i = 0; i < w * h; i++) if (rock[i]) terrain[i] = WALL;
  const nIsl = Math.max(3, Math.round(w / 100) | 1);
  const isl = Array.from({ length: nIsl }, (_, k) => {
    const f = (k + 0.5) / nIsl, mid = k === (nIsl - 1) / 2;
    return { cx: Math.round(w * f), hw: Math.round(w * (mid ? 0.08 : 0.045)) };
  });
  const land = new Uint8Array(w * h);
  for (const { cx, hw } of isl) {
    for (let x = cx - hw; x <= cx + hw; x++) {
      const k = (x - cx) / hw, top2 = S - Math.round((S - 2) * Math.min(1, 1.8 * (1 - k * k)));
      for (let y = top2; y < S; y++) {
        terrain[y * w + x] = FLOOR;
        land[y * w + x] = 1;
      }
    }
  }
  const seen = new Uint8Array(w * h), q = [];
  for (let x = 1; x < w - 1; x++) if (terrain[S * w + x] === FLOOR) {
    seen[S * w + x] = 1;
    q.push(S * w + x);
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    for (const n of [i - 1, i + 1, i - w, i + w]) if (n >= 0 && n < w * h && !seen[n] && terrain[n] === FLOOR) {
      seen[n] = 1;
      q.push(n);
    }
  }
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !seen[i]) terrain[i] = WALL;
  const landP = new Uint8Array(w * h), seaP = new Uint8Array(w * h);
  const level = (d) => d < calm ? 0 : Math.min(bands - 1, 1 + Math.floor((d - calm) / (1 - calm) * (bands - 1)));
  for (let y = S; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (terrain[i] === FLOOR) landP[i] = level(depthOf(y));
  }
  const spawns = [];
  const has = /* @__PURE__ */ new Set();
  const add = (x, y) => {
    const i = y * w + x;
    if (terrain[i] !== FLOOR || land[i] || has.has(i) || x === reefX) return;
    has.add(i);
    spawns.push({ x, y, kind: 1 });
  };
  for (let y = S; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px >= w || py >= h) continue;
      if (rng() < 0.25 + 0.75 * depthOf(py)) add(px, py);
    }
  }
  for (let y = sharkLine; y < h - 1; y++) for (let x = 2; x < w - 2; x += 3) {
    if (terrain[y * w + x] === FLOOR && terrain[(y + 1) * w + x] !== FLOOR && rng() < 0.5) add(x, y);
  }
  const home = isl[nIsl - 1 >> 1], top = S - 4;
  const homeRect = { x: home.cx - 7, y: top, w: 14, h: 4 };
  const reef = [];
  for (let y = sharkLine; y < h; y++) {
    const i = y * w + reefX;
    if (terrain[i] === FLOOR) {
      terrain[i] = WALL;
      reef.push(i);
    }
  }
  const bayRect = { x: 1, y: sharkLine, w: bayW, h: bedMax - sharkLine };
  return { w, h, terrain, spawns, starts: [homeRect, bayRect], rooms: [], toxin: landP, toxinBy: [landP, seaP], startRealm: [0, 1], surface: S, land, sharkLine, reef, calmLine: S + Math.round(calm * (bedMax - S)) };
}

// src/sim/world.ts
var NONE = -1;
var K = CODE["K"];
var DEBRIS = -2;
var CONFIG = {
  sight: 14,
  // LoS range from each cell (Chebyshev)
  bombRange: 6,
  // BOMB reach from the cell that sees the target
  writeRange: 2,
  // WRITE reach into foreign cells, from the cell that sees the target
  killPay: 0.25,
  // a killer takes this fraction of the victim's max size and speed
  creditWindow: 500,
  // a death within this many ticks of being harmed credits the harmer
  stackMax: 64,
  sizeCap: 64,
  startSize: 40,
  // every warrior starts with this max size (the most cells its body may have)
  startCells: 30,
  // a warrior file holds at most this many cells: the rest of max size is room to GROW
  sizeDecay: 4e-3,
  // per tick at the starting max size; scales with √(max size / startSize), so
  // 40→8 takes ~11000 ticks and 8→starved another ~6000 (~17000 from 40)
  divideMin: 16,
  // DIVIDE needs at least this max size (and 2× its cells)
  sizePickup: 4,
  debrisPickup: 0.5,
  speedStart: 2,
  speedFloor: 1,
  speedCap: 8,
  speedDecay: 1e-3,
  // per tick
  speedPickup: 1,
  spawnInterval: 120,
  // ticks between respawns at an empty spot
  tickCap: 5e3,
  copyError: 0.02,
  // DIVIDE: chance each copied cell becomes a random glyph
  maxWarriors: 64,
  // DIVIDE fails while this many warriors are alive
  reaperCap: 0,
  // petri dish: with this many alive, a birth kills the oldest living warrior (0 = off)
  lifespan: 0,
  // petri dish: typical lifespan in ticks; each warrior's is 50–150% of it (0 = off)
  endless: false,
  // petri dish: don't end when one lineage is left (only the tick cap ends it)
  plate: 0,
  // petri dish: board is a round plate this many cells across (0 = rooms board)
  plateBands: 5,
  // plate: toxin levels, clean middle (0) to rim (bands-1)
  plateFood: 5,
  // plate: about one food spot per this many cells squared
  toxinRate: 1e-3,
  // plate: each tick, a cell one toxin level above my armor (K count) dies with this chance…
  toxinStep: 10,
  // …and each further level multiplies it by this (MEGA-plate bands were 10× steps)
  foodRipen: 0,
  // petri dish: an uneaten size pickup grows by one pickup's worth every this many ticks (0 = off)…
  foodRipeMax: 5,
  // …up to this many pickups' worth
  copyInsert: 0,
  // DIVIDE: chance the child gains a fat cell (.) stuck to its body
  copyDelete: 0,
  // DIVIDE: chance the child loses one cell (never its IP cell; stays connected)
  island: false,
  // island survival: side view, islanders vs sea creatures (board width = plate)
  starve: 600,
  // island: ticks an unfed seal with max size 20 lasts (about a tenth of a lifetime)
  sharkStarve: 6e3,
  // island: the same for a shark (10× a seal's, as is its lifespan: about 10 meals a life for both)
  sharkLife: 10,
  // island: a sea creature's lifespan is this many times CONFIG.lifespan
  paceMass: 11,
  // island: pace = (1 + M cells) / (1 + mass / this); the seal founder's mass is 11
  paceSpeed: 2,
  // island: instructions per tick at pace 1
  sharkCap: 128,
  // island: a sea creature's largest max size
  kelpFeed: 8,
  // island: max size a seal gains from a kelp (times its ripeness), a real meal
  depth: 0.75,
  // island: the sea is this many times as deep as it is wide
  calm: 0.35,
  // island: top share of the water with no pressure (seals overlap sharks below `shallows`)
  shallows: 0.4,
  // island: sea creatures can't swim into this top share of the water (blocked, never hurt)
  sharkArrive: 6e4,
  // island: the reef channel opens and the sea founders arrive at this tick (0 = at the start)
  seals: 60,
  // island: each islander founder starts with this many copies spread through the calm water
  sharkFull: 0.75,
  // island: a sea creature at this share of its size cap is full and won't bite
  biteRange: 2,
  // island: a sea creature's BOMB reach (a bite, not a shot)
  seaFeed: 2,
  // island: max size a sea creature gains per dead cell it collects
  sinkEvery: 6,
  // island: dead cells sink one row every this many ticks (marine snow)
  rot: 3e-3,
  // island: per tick, a dead cell that can't sink rots away with this chance
  corpse: 0.33
  // island: share of a dead body's cells left as dead cells (the rest dissolves)
};
var World = class {
  constructor(seed, specs) {
    this.seed = seed;
    this.board = CONFIG.island ? makeIsland(seed, CONFIG.plate || 360, CONFIG.plateBands, CONFIG.plateFood, CONFIG.shallows, CONFIG.calm, CONFIG.depth) : CONFIG.plate ? makePlate(seed, CONFIG.plate, CONFIG.plateBands, CONFIG.plateFood) : makeBoard(seed);
    this.w = this.board.w;
    this.h = this.board.h;
    this.owner = new Int32Array(this.w * this.h).fill(NONE);
    this.code = new Uint8Array(this.w * this.h);
    this.resource = new Uint8Array(this.w * this.h);
    this.ripe = new Float32Array(this.w * this.h).fill(1);
    this.rng = makeRng(seed);
    this.spawnTimers = this.board.spawns.map(() => 0);
    for (const s of this.board.spawns) this.resource[s.y * this.w + s.x] = s.kind;
    this.narrow = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isFloor(x, y)) continue;
        let a = x, b = x, c = y, d = y;
        while (this.isFloor(a - 1, y)) a--;
        while (this.isFloor(b + 1, y)) b++;
        while (this.isFloor(x, c - 1)) c--;
        while (this.isFloor(x, d + 1)) d++;
        if (b - a < 2 || d - c < 2) this.narrow[this.idx(x, y)] = 1;
      }
    }
    for (const s of specs) {
      if (CONFIG.island && s.realm === "sea" && CONFIG.sharkArrive > 0) this.arriving.push(s);
      else this.place(s, this.warriors.length);
    }
    if (CONFIG.island) this.settle();
  }
  board;
  w;
  h;
  owner;
  code;
  resource;
  // 0 none, 1 size, 2 speed
  ripe;
  // size pickups: how many pickups' worth (1 when it appears; grows with foodRipen)
  /** Floor cells in a passage at most 2 wide (the floor run through them, across or down, is ≤ 2). */
  narrow;
  warriors = [];
  /** The living warriors (a long dish has far more dead than alive). Rebuilt lazily after deaths. */
  livingList = [];
  livingDirty = false;
  bornIn = /* @__PURE__ */ new Map();
  // lineage → warriors born so far (for names)
  t = 0;
  rng;
  events = [];
  /** Every bomb hit and poison write so far, kin included (the per-warrior stats count rivals only). */
  attacks = { bombs: 0, poisons: 0 };
  result = { over: false, winner: null, reason: "" };
  spawnTimers;
  // ---------- setup ----------
  arriving = [];
  /** Bumped whenever the terrain changes (the island's channel opening), so a viewer can redraw scenery. */
  terrainVersion = 0;
  place(spec, id, at) {
    if (spec.cells.length > CONFIG.startCells) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startCells}`);
    }
    const realm = this.board.startRealm ? spec.realm === "sea" ? 1 : 0 : 0;
    const room = this.board.startRealm ? this.board.starts[this.board.startRealm.indexOf(realm)] : this.board.starts[id % this.board.starts.length];
    const before = this.board.startRealm ? this.warriors.filter((w) => w.realm === realm).length : 0;
    const shift = before ? (before % 2 ? 1 : -1) * Math.ceil(before / 2) * (spec.width + 3) : 0;
    const ox = at ? at[0] : room.x + Math.floor((room.w - spec.width) / 2) + shift;
    const oy = at ? at[1] : room.y + Math.floor((room.h - spec.height) / 2);
    const wr = {
      id,
      lineage: id,
      gen: 0,
      realm,
      born: 0,
      name: spec.name,
      alive: true,
      ipX: ox + spec.ip.x,
      ipY: oy + spec.ip.y,
      ox: ox + spec.ip.x,
      oy: oy + spec.ip.y,
      dir: spec.dir,
      stack: [],
      maxSize: CONFIG.island ? realm ? CONFIG.sharkCap : CONFIG.sizeCap : CONFIG.startSize,
      speed: CONFIG.speedStart,
      // island founders start full
      accum: 0,
      lastOk: true,
      lastAct: "",
      cellCount: 0,
      executed: 0,
      spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
      home: room,
      roomsSeen: /* @__PURE__ */ new Set()
    };
    if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(wr.realm) * (0.5 + this.rng()));
    for (const c of spec.cells) {
      const x = ox + c.x, y = oy + c.y;
      if (!this.isFloor(x, y)) throw new Error(`${spec.name} does not fit in its start room`);
      const i = this.idx(x, y);
      this.setOwner(i, id);
      this.code[i] = c.code;
      this.resource[i] = 0;
      wr.cellCount++;
    }
    this.warriors.push(wr);
    this.livingList.push(wr);
    this.bornIn.set(id, 1);
  }
  /** Living warriors, in id order. */
  living() {
    if (this.livingDirty) {
      this.livingList = this.livingList.filter((w) => w.alive);
      this.livingDirty = false;
    }
    return this.livingList;
  }
  // ---------- helpers ----------
  idx(x, y) {
    return y * this.w + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  isFloor(x, y) {
    return this.inBounds(x, y) && this.board.terrain[this.idx(x, y)] === FLOOR;
  }
  ownerAt(x, y) {
    return this.inBounds(x, y) ? this.owner[this.idx(x, y)] : NONE;
  }
  /** Free for this warrior to move into: free, or (island) vegetation a sea creature swims over (it stays) or a dead cell it eats. */
  passable(wr, x, y) {
    if (this.sharkBlocked(wr, y)) return false;
    if (this.isFree(x, y)) return true;
    if (!CONFIG.island || wr.realm !== 1 || !this.isFloor(x, y)) return false;
    const o = this.owner[this.idx(x, y)];
    return o === NONE || o === DEBRIS;
  }
  /** Island survival: sea creatures can't get into the shallows or onto land (blocked, never hurt). */
  sharkBlocked(wr, y) {
    return CONFIG.island && wr.realm === 1 && y < (this.board.sharkLine ?? 0);
  }
  /** Floor with nothing on it: no cell, no debris, no resource. */
  isFree(x, y) {
    if (!this.isFloor(x, y)) return false;
    const i = this.idx(x, y);
    return this.owner[i] === NONE && this.resource[i] === 0;
  }
  // Cells by owner (warrior id, or DEBRIS), kept in step with `owner` by setOwner, so
  // nothing has to scan the whole board to find a warrior's cells.
  cellSets = /* @__PURE__ */ new Map();
  sortedCells = /* @__PURE__ */ new Map();
  /** The way `owner` changes (opShift does a bulk equivalent). */
  setOwner(i, v) {
    const o = this.owner[i];
    if (o === v) return;
    if (o !== NONE) {
      this.cellSets.get(o).delete(i);
      this.sortedCells.delete(o);
    }
    this.owner[i] = v;
    if (v !== NONE) {
      let set = this.cellSets.get(v);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        this.cellSets.set(v, set);
      }
      set.add(i);
      this.sortedCells.delete(v);
    }
  }
  /** A warrior's (or DEBRIS's) cells in board order. Treat the array as read-only. */
  cellsOf(id) {
    let out = this.sortedCells.get(id);
    if (!out) {
      out = Array.from(Int32Array.from(this.cellSets.get(id) ?? []).sort());
      this.sortedCells.set(id, out);
    }
    return out;
  }
  log(kind, text, who) {
    this.events.push({ t: this.t, kind, text, who });
    if (this.events.length > 2e3) this.events.splice(0, 500);
  }
  // Walls block LoS; cells don't. Bresenham, endpoints excluded.
  clearLine(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.board.terrain[this.idx(x, y)] !== FLOOR) return false;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  /** Index of one of my cells that sees (x,y) within `range`, or -1. Own cells always count as seen. */
  seer(id, x, y, range = CONFIG.sight, mine) {
    if (this.ownerAt(x, y) === id) return this.idx(x, y);
    for (const c of mine ?? this.cellsOf(id)) {
      const cx = c % this.w, cy = c / this.w | 0;
      if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) > range) continue;
      if (this.clearLine(cx, cy, x, y)) return c;
    }
    return -1;
  }
  /** 4-connected check of a warrior's cells from its IP. Returns unreached cells. */
  unreached(wr) {
    const mine = this.cellsOf(wr.id);
    const seen = /* @__PURE__ */ new Set();
    const start = this.idx(wr.ipX, wr.ipY);
    if (this.owner[start] !== wr.id) return mine;
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.pop();
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const n = this.idx(nx, ny);
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return mine.filter((c) => !seen.has(c));
  }
  toDebris(i) {
    const o = this.owner[i];
    if (o >= 0) this.warriors[o].cellCount--;
    if (CONFIG.island && (o >= 0 && this.warriors[o].realm === 1 || this.rng() >= CONFIG.corpse)) {
      this.setOwner(i, NONE);
      this.code[i] = 0;
      return;
    }
    this.setOwner(i, DEBRIS);
  }
  kill(wr, reason) {
    if (!wr.alive) return;
    wr.alive = false;
    this.livingDirty = true;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    const h0 = wr.lastHarm;
    const k0 = h0 && this.t - h0.t <= CONFIG.creditWindow ? this.warriors[h0.by] : void 0;
    if (CONFIG.island && k0 && k0.alive && k0.realm === 1 && wr.realm === 0) {
      const cells = this.cellsOf(wr.id).slice();
      k0.maxSize = Math.min(this.capOf(k0), k0.maxSize + CONFIG.seaFeed * (cells.length + 1));
      k0.stats.kills++;
      for (const c of cells) {
        this.setOwner(c, NONE);
        this.code[c] = 0;
      }
      wr.cellCount = 0;
      this.log("death", `${wr.name} died: ${reason}; ${k0.name} ate it (max ${Math.floor(k0.maxSize)})`, wr.id);
      return;
    }
    for (const c of this.cellsOf(wr.id)) this.toDebris(c);
    this.log("death", `${wr.name} died: ${reason}`, wr.id);
    const h = wr.lastHarm;
    const killer = h && this.t - h.t <= CONFIG.creditWindow ? this.warriors[h.by] : void 0;
    if (killer && killer.alive && killer !== wr) {
      if (killer.lineage !== wr.lineage) killer.stats.kills++;
      killer.maxSize = Math.min(CONFIG.sizeCap, killer.maxSize + CONFIG.killPay * wr.maxSize);
      killer.speed = Math.min(CONFIG.speedCap, killer.speed + CONFIG.killPay * wr.speed);
      this.log("kill", `${killer.name} takes a cut of ${wr.name} (max ${Math.floor(killer.maxSize)}, speed ${killer.speed.toFixed(2)})`, killer.id);
    }
  }
  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  /** Destroy a cell outright: a bomb (`by`), or the plate's toxin (no `by`). */
  destroy(i, by, cause = "core poisoned by the toxin") {
    const o = this.owner[i];
    this.setOwner(i, NONE);
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warriors[o];
    victim.cellCount--;
    if (by) victim.lastHarm = { by: by.id, t: this.t };
    if (i === this.idx(victim.ipX, victim.ipY)) {
      this.kill(victim, by ? `core bombed by ${by.name}` : cause);
      return;
    }
    const cut = this.unreached(victim);
    if (cut.length) {
      for (const c of cut) this.toDebris(c);
      this.log("cut", `${victim.name} lost ${cut.length} cells cut off`, victim.id);
    }
  }
  // ---------- tick ----------
  tick() {
    if (this.result.over) return;
    this.t++;
    const spawns = this.board.spawns;
    for (let k = 0; k < spawns.length; k++) {
      const s = spawns[k];
      const i = this.idx(s.x, s.y);
      if (CONFIG.foodRipen > 0 && this.resource[i] === 1) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + 1 / CONFIG.foodRipen);
      let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
      for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
      if (touched) {
        this.spawnTimers[k] = 0;
        continue;
      }
      if (++this.spawnTimers[k] >= CONFIG.spawnInterval) {
        this.resource[i] = s.kind;
        this.ripe[i] = 1;
        this.spawnTimers[k] = 0;
      }
    }
    if (CONFIG.island) this.islandTick();
    if (this.arriving.length && this.t >= CONFIG.sharkArrive) this.arrive();
    const order = this.living().slice();
    const n = order.length;
    for (let k = 0; k < n; k++) {
      const wr = order[(this.t + k) % n];
      if (!wr.alive) continue;
      wr.accum += wr.speed;
      while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
    }
    for (const wr of this.living().slice()) {
      if (!wr.alive) continue;
      const cells = this.cellSets.get(wr.id);
      if (cells) {
        const hm = wr.home;
        let home = 0, narrow = 0, x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
        for (const c of cells) {
          const x = c % this.w, y = c / this.w | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (x >= hm.x && y >= hm.y && x < hm.x + hm.w && y < hm.y + hm.h) home++;
          if (this.narrow[c]) narrow++;
        }
        if (wr.leftHomeAt === void 0 && home === 0 && cells.size > 0) {
          wr.leftHomeAt = this.t;
          this.log("left", `${wr.name} left its start room (whole body)`, wr.id);
        }
        if (cells.size >= 4 && 2 * narrow >= cells.size) wr.stats.squeezed++;
        if (home === 0) {
          this.board.rooms.forEach((r, k) => {
            if (x0 < r.x || y0 < r.y || x1 >= r.x + r.w || y1 >= r.y + r.h || wr.roomsSeen.has(k)) return;
            if (r.x === hm.x && r.y === hm.y) return;
            wr.roomsSeen.add(k);
            wr.stats.rooms++;
            this.log("room", `${wr.name} moved its whole body into another room`, wr.id);
          });
        }
      }
      const tox = this.board.toxinBy ? this.board.toxinBy[wr.realm] : this.board.toxin;
      if (tox && cells) {
        let armor = 0;
        for (const c of cells) if (this.code[c] === K) armor++;
        const doomed = [];
        for (const c of cells) {
          const over = tox[c] - armor;
          if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed.push(c);
        }
        const cause = !this.board.toxinBy ? void 0 : wr.realm ? "core crushed (too shallow)" : "core crushed by the pressure";
        for (const c of doomed) {
          if (!wr.alive) break;
          if (this.owner[c] === wr.id) this.destroy(c, void 0, cause);
        }
        if (!wr.alive) continue;
      }
      if (CONFIG.island) {
        const pace = this.paceOf(wr);
        wr.pace = pace;
        wr.speed = CONFIG.paceSpeed * pace;
        const hunger = pace * (Math.sqrt(20) - 1) * 2 * Math.sqrt(CONFIG.startSize) / CONFIG.sizeDecay / (wr.realm ? CONFIG.sharkStarve : CONFIG.starve);
        wr.maxSize = Math.max(0, wr.maxSize - hunger * CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
        wr.aged = (wr.aged ?? 0) + pace;
      } else {
        wr.maxSize = Math.max(0, wr.maxSize - CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
        wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
      }
      if (wr.maxSize < 1) this.kill(wr, "starved (max size fell to 0)");
      else if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
      if (!wr.alive) continue;
      if (wr.cellCount <= 0) this.kill(wr, "no cells left");
      else if (wr.diesAt !== void 0 && (CONFIG.island ? (wr.aged ?? 0) >= wr.diesAt - wr.born : this.t >= wr.diesAt)) this.kill(wr, "old age");
    }
    this.checkOver();
  }
  /**
   * Island survival: a settled archipelago. Each islander founder gets CONFIG.seals copies
   * of itself (its descendants, generation 1) scattered through the calm water.
   */
  settle() {
    for (const f of this.warriors.filter((w) => w.realm === 0 && w.gen === 0)) {
      const S = this.board.surface ?? 0, calm = this.board.calmLine ?? S;
      for (let n = 0, tries = 0; n < CONFIG.seals && tries < CONFIG.seals * 50; tries++) {
        const bay = this.board.starts[1], x0 = bay.x + bay.w + 2;
        const ox = x0 + Math.floor(this.rng() * (this.w - 1 - x0 - f.spec.width)), oy = S + Math.floor(this.rng() * Math.max(1, calm - S - f.spec.height));
        if (!f.spec.cells.every((c) => this.isFree(ox + c.x, oy + c.y))) continue;
        const id = this.warriors.length;
        const born = this.bornIn.get(f.lineage) ?? 1;
        this.bornIn.set(f.lineage, born + 1);
        const wr = {
          ...f,
          id,
          gen: 1,
          parent: f.id,
          name: `${f.name}\xB7${born}`,
          ipX: ox + f.spec.ip.x,
          ipY: oy + f.spec.ip.y,
          ox: ox + f.spec.ip.x,
          oy: oy + f.spec.ip.y,
          stack: [],
          cellCount: 0,
          executed: 0,
          roomsSeen: /* @__PURE__ */ new Set(),
          stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }
        };
        if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(0) * (0.5 + this.rng()));
        this.warriors.push(wr);
        this.livingList.push(wr);
        for (const c of f.spec.cells) {
          const i = this.idx(ox + c.x, oy + c.y);
          this.setOwner(i, id);
          this.code[i] = c.code;
          wr.cellCount++;
        }
        n++;
      }
    }
  }
  /**
   * Island survival: a body's pace, from what it's made of. Move cells (M) quicken it; mass
   * slows it, with armor (K) and fat (.) counting double. The seal founder is 1.
   */
  paceOf(wr) {
    let m = 0, mass = 0;
    for (const c of this.cellsOf(wr.id)) {
      const g = this.code[c];
      if (g === CODE["M"]) m++;
      mass += g === K || g === CODE["."] ? 2 : 1;
    }
    return (1 + m) / (1 + mass / CONFIG.paceMass);
  }
  /** Size cap for a realm (island sea creatures are big and need room to breed). */
  capOf(wr) {
    return CONFIG.island && wr.realm === 1 ? CONFIG.sharkCap : CONFIG.sizeCap;
  }
  /** Typical lifespan for a realm (island sea creatures live CONFIG.sharkLife times longer). */
  lifeOf(realm) {
    return CONFIG.lifespan * (CONFIG.island && realm === 1 ? CONFIG.sharkLife : 1);
  }
  /** Island survival: weather opens the reef channel and the waiting sea founders swim in, each once its spot is clear. */
  arrive() {
    if (this.board.reef?.length) {
      for (const i of this.board.reef) this.board.terrain[i] = FLOOR;
      this.board.reef = [];
      this.terrainVersion++;
      this.log("arrive", "weather opens a channel through the reef");
    }
    for (let k = 0; k < this.arriving.length; k++) {
      const spec = this.arriving[k];
      const room = this.board.starts[this.board.startRealm.indexOf(1)];
      let at = null;
      for (let oy = room.y + 1; oy + spec.height <= room.y + room.h && !at; oy += 2) {
        for (let ox = room.x; ox + spec.width <= room.x + room.w && !at; ox++) {
          if (spec.cells.every((c) => this.isFloor(ox + c.x, oy + c.y) && this.owner[this.idx(ox + c.x, oy + c.y)] === NONE)) at = [ox, oy];
        }
      }
      if (!at) continue;
      this.place(spec, this.warriors.length, at);
      this.warriors[this.warriors.length - 1].born = this.t;
      if (CONFIG.lifespan > 0) this.warriors[this.warriors.length - 1].diesAt = this.t + Math.floor(this.lifeOf(1) * (0.5 + this.rng()));
      this.arriving.splice(k--, 1);
      this.log("arrive", `${spec.name} arrives`, this.warriors.length - 1);
    }
  }
  /** Island survival, once a tick: dead cells sink (and rot where they can't). */
  islandTick() {
    if (this.t % CONFIG.sinkEvery === 0) {
      const dead = this.cellsOf(DEBRIS).slice().reverse();
      for (const c of dead) {
        const below = c + this.w;
        if (this.isFloor(c % this.w, (c / this.w | 0) + 1) && this.owner[below] === NONE) {
          this.setOwner(below, DEBRIS);
          this.code[below] = this.code[c];
          this.setOwner(c, NONE);
          this.code[c] = 0;
        } else if (this.rng() < CONFIG.rot * CONFIG.sinkEvery) {
          this.setOwner(c, NONE);
          this.code[c] = 0;
        }
      }
    }
  }
  /**
   * Upkeep: lose one cell. Burn fat first: the farthest `.` (no-op) cell whose removal
   * keeps the body connected. With no fat, drop the cell farthest (by path) from the IP,
   * which can never disconnect the rest — but is usually code, so the program rots.
   */
  shed(wr) {
    const start = this.idx(wr.ipX, wr.ipY);
    const dist = /* @__PURE__ */ new Map([[start, 0]]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const ni = this.idx(nx, ny);
        if (!dist.has(ni)) {
          dist.set(ni, dist.get(c) + 1);
          queue.push(ni);
        }
      }
    }
    const byFar = queue.slice(1).reverse();
    if (!byFar.length) return;
    let drop = byFar[0];
    for (const c of byFar) {
      if (this.code[c] !== CODE["."]) continue;
      this.setOwner(c, NONE);
      const ok = this.unreached(wr).length === 0;
      this.setOwner(c, wr.id);
      if (ok) {
        drop = c;
        break;
      }
    }
    const lost = GLYPHS[this.code[drop]] ?? ".";
    this.setOwner(drop, NONE);
    this.code[drop] = 0;
    wr.cellCount--;
    this.log("shed", `${wr.name} shed ${lost === "." ? "fat" : `code '${lost}'`} (max size ${Math.floor(wr.maxSize)})`, wr.id);
  }
  /** True when every living warrior is of one lineage (only possible once someone divides). */
  oneTeamLeft() {
    let team = -1;
    for (const w of this.living()) {
      if (team === -1) team = w.lineage;
      else if (w.lineage !== team) return false;
    }
    return team !== -1 && this.warriors.some((w) => w.lineage !== team);
  }
  checkOver() {
    const living = this.living().length;
    if (CONFIG.endless && this.t < CONFIG.tickCap) return;
    if (living > 1 && this.t < CONFIG.tickCap && !this.oneTeamLeft()) return;
    const founders = this.warriors.filter((w) => w.gen === 0);
    const teams = /* @__PURE__ */ new Map();
    for (const w of this.warriors) if (w.alive) teams.set(w.lineage, [...teams.get(w.lineage) ?? [], w]);
    if (founders.length > 1 && teams.size <= 1) {
      this.result = teams.size ? { over: true, winner: [...teams.keys()][0], reason: "last standing" } : { over: true, winner: null, reason: "mutual destruction" };
    } else if (founders.length === 1 && teams.size === 0) {
      this.result = { over: true, winner: null, reason: "died" };
    } else if (this.t >= CONFIG.tickCap) {
      const keys = (ms) => [
        ms.reduce((a, w) => a + w.cellCount, 0),
        ms.reduce((a, w) => a + w.maxSize, 0),
        ms.reduce((a, w) => a + w.speed, 0)
      ];
      const ranked = [...teams.entries()].map(([team, ms]) => ({ team, k: keys(ms) }));
      const cmp = (a, b) => {
        for (let k = 0; k < a.k.length; k++) if (Math.abs(a.k[k] - b.k[k]) >= 0.01) return b.k[k] - a.k[k];
        return 0;
      };
      ranked.sort(cmp);
      const tied = ranked.length > 1 && cmp(ranked[0], ranked[1]) === 0;
      const top = ranked[0], next = ranked[1];
      const by = !next || Math.abs(top.k[0] - next.k[0]) >= 0.01 ? `biggest body (${top.k[0]} cells)` : Math.abs(top.k[1] - next.k[1]) >= 0.01 ? `bodies tied, larger max size (${top.k[1].toFixed(1)})` : `bodies and max size tied, faster (${top.k[2].toFixed(2)})`;
      this.result = tied ? { over: true, winner: null, reason: "draw at tick cap" } : { over: true, winner: top.team, reason: `${by} at tick cap` };
    }
    if (this.result.over) this.log("over", this.result.winner === null ? `Match over: ${this.result.reason}` : `${this.warriors[this.result.winner].name} wins: ${this.result.reason}`);
  }
  // ---------- interpreter ----------
  /** The point instruction offsets are measured from. */
  frame(wr) {
    return [wr.ox, wr.oy];
  }
  pop(wr) {
    return wr.stack.length ? wr.stack.pop() : 0;
  }
  push(wr, v) {
    wr.stack.push(v | 0);
    if (wr.stack.length > CONFIG.stackMax) wr.stack.shift();
  }
  /** Move the IP to the next own cell in its direction, wrapping within the body. */
  advance(wr) {
    const { w, h, owner } = this;
    const id = wr.id, dir = wr.dir;
    const horiz = dir === 0 || dir === 2;
    const step = dir === 0 ? 1 : dir === 2 ? -1 : dir === 1 ? w : -w;
    const pos = horiz ? wr.ipX : wr.ipY;
    const len = horiz ? w : h;
    const fwd = dir === 0 || dir === 1;
    const start = wr.ipY * w + wr.ipX;
    let i = start + step;
    for (let p = pos + (fwd ? 1 : -1); fwd ? p < len : p >= 0; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) {
        this.setIp(wr, i);
        return;
      }
    }
    i = start - step * (fwd ? pos : len - 1 - pos);
    for (let p = fwd ? 0 : len - 1; p !== pos; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) {
        this.setIp(wr, i);
        return;
      }
    }
  }
  setIp(wr, i) {
    wr.ipX = i % this.w;
    wr.ipY = i / this.w | 0;
  }
  /** Execute one instruction. Returns its cycle cost. */
  step(wr) {
    const g = GLYPHS[this.code[this.idx(wr.ipX, wr.ipY)]] ?? ".";
    wr.executed++;
    let skip = false;
    let cost = COST[g] ?? 1;
    switch (g) {
      case ">":
        wr.dir = 0;
        break;
      case "v":
        wr.dir = 1;
        break;
      case "<":
        wr.dir = 2;
        break;
      case "^":
        wr.dir = 3;
        break;
      case "_":
        wr.dir = this.pop(wr) === 0 ? 0 : 2;
        break;
      case "|":
        wr.dir = this.pop(wr) === 0 ? 1 : 3;
        break;
      case "#":
        skip = true;
        break;
      case "?":
        wr.dir = Math.floor(this.rng() * 4);
        break;
      case "@":
        this.kill(wr, "executed @");
        return 1;
      case "r":
        wr.dir = (wr.dir + 2) % 4;
        break;
      case "[":
        wr.dir = (wr.dir + 3) % 4;
        break;
      case "]":
        wr.dir = (wr.dir + 1) % 4;
        break;
      case ":": {
        const a = this.pop(wr);
        this.push(wr, a);
        this.push(wr, a);
        break;
      }
      case "\\": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, b);
        this.push(wr, a);
        break;
      }
      case "$":
        this.pop(wr);
        break;
      case "o": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a);
        this.push(wr, b);
        this.push(wr, a);
        break;
      }
      case "+": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a + b);
        break;
      }
      case "-": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a - b);
        break;
      }
      case "*": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a * b);
        break;
      }
      case "/": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, b === 0 ? 0 : Math.trunc(a / b));
        break;
      }
      case "%": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, b === 0 ? 0 : a % b);
        break;
      }
      case "!":
        this.push(wr, this.pop(wr) === 0 ? 1 : 0);
        break;
      case "`": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a > b ? 1 : 0);
        break;
      }
      case "=": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a === b ? 1 : 0);
        break;
      }
      case "'": {
        const sx = wr.ipX, sy = wr.ipY;
        this.advance(wr);
        this.push(wr, this.code[this.idx(wr.ipX, wr.ipY)]);
        wr.ipX = sx;
        wr.ipY = sy;
        skip = true;
        break;
      }
      case "y": {
        const n = this.pop(wr);
        this.push(wr, n > 0 ? Math.floor(this.rng() * n) : 0);
        break;
      }
      case "s":
        this.push(wr, wr.cellCount);
        break;
      case "m":
        this.push(wr, Math.floor(wr.maxSize));
        break;
      case "f":
        this.push(wr, Math.floor(wr.speed * 10));
        break;
      case "d":
        this.push(wr, wr.dir);
        break;
      case "e":
        this.push(wr, wr.lastOk ? 1 : 0);
        break;
      case "L":
        this.opLook(wr);
        break;
      case "S":
        this.opScan(wr);
        break;
      case "R":
        this.opRead(wr);
        break;
      case "T": {
        const dy = this.pop(wr), dx = this.pop(wr);
        if (dx === 0 && dy === 0) this.push(wr, Math.floor(this.rng() * 4));
        else if (Math.abs(dx) >= Math.abs(dy)) this.push(wr, dx > 0 ? 0 : 2);
        else this.push(wr, dy > 0 ? 1 : 3);
        break;
      }
      case "M":
        wr.lastOk = this.opShift(wr, this.pop(wr));
        break;
      case "A":
        wr.lastOk = this.opOoze(wr, this.pop(wr));
        break;
      case "F": {
        const d = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr);
        wr.lastOk = this.opFlow(wr, dx, dy, d);
        break;
      }
      case "X": {
        const dy2 = this.pop(wr), dx2 = this.pop(wr), dy1 = this.pop(wr), dx1 = this.pop(wr);
        wr.lastOk = this.opSwap(wr, dx1, dy1, dx2, dy2);
        break;
      }
      case "G":
        wr.lastOk = this.opGrow(wr, this.pop(wr));
        break;
      case "C":
        wr.lastOk = this.opCollect(wr);
        break;
      case "B": {
        if (!wr.stack.length) {
          wr.lastOk = this.opBombNearest(wr);
          break;
        }
        const dy = this.pop(wr), dx = this.pop(wr);
        const [fx, fy] = this.frame(wr);
        wr.lastOk = this.opBombAt(wr, fx + dx, fy + dy);
        break;
      }
      case "W": {
        const c = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr);
        wr.lastOk = this.opWrite(wr, dx, dy, c);
        break;
      }
      // Copying costs a cycle per cell; a failed attempt costs 1.
      case "D": {
        const before = wr.cellCount;
        wr.lastOk = this.opDivide(wr, this.pop(wr));
        cost = wr.lastOk ? Math.max(1, before) : 1;
        break;
      }
      default:
        if (g >= "0" && g <= "9") this.push(wr, g.charCodeAt(0) - 48);
        break;
    }
    if ("MFXGCBWDA".includes(g)) wr.lastAct = g;
    if (!wr.alive) return cost;
    this.advance(wr);
    if (skip) this.advance(wr);
    return cost;
  }
  // ---------- sensing ----------
  classify(x, y, me) {
    if (!this.isFloor(x, y)) return T_WALL;
    const i = this.idx(x, y);
    const o = this.owner[i];
    if (o === DEBRIS) return T_DEBRIS;
    if (o >= 0 && o !== me) return T_ENEMY;
    if (this.resource[i] === 1) return T_SIZE;
    if (this.resource[i] === 2) return T_SPEED;
    return T_NOTHING;
  }
  opLook(wr) {
    const d = (this.pop(wr) % 4 + 4) % 4;
    let x = wr.ipX, y = wr.ipY;
    for (let dist = 1; dist <= CONFIG.sight; dist++) {
      x += DX[d];
      y += DY[d];
      if (this.ownerAt(x, y) === wr.id) continue;
      const t = this.classify(x, y, wr.id);
      if (t !== T_NOTHING) {
        this.push(wr, dist);
        this.push(wr, t);
        return;
      }
    }
    this.push(wr, 0);
    this.push(wr, T_NOTHING);
  }
  opScan(wr) {
    const type = this.pop(wr);
    const mine = this.cellsOf(wr.id);
    const r = CONFIG.sight;
    const [fx, fy] = this.frame(wr);
    const x0 = Math.max(0, wr.ipX - r - 16), x1 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const cands = [];
    const consider = (i) => {
      const x = i % this.w, y = i / this.w | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) return;
      if (CONFIG.island && wr.realm === 1 && y < (this.board.sharkLine ?? 0)) return;
      const t = this.classify(x, y, wr.id);
      const match = type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type;
      if (!match || t === T_WALL || t === T_NOTHING) return;
      cands.push([Math.abs(x - fx) + Math.abs(y - fy), i, x, y]);
    };
    if (type === T_ENEMY) {
      for (const other of this.living()) if (other.id !== wr.id && !(CONFIG.island && other.realm === wr.realm)) for (const i of this.cellSets.get(other.id) ?? []) consider(i);
    } else if (type === T_DEBRIS) {
      for (const i of this.cellSets.get(DEBRIS) ?? []) consider(i);
    } else if (type === T_SIZE || type === T_SPEED || type === T_RESOURCE) {
      for (const sp of this.board.spawns) consider(this.idx(sp.x, sp.y));
    }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , x, y] of cands) {
      if (this.seer(wr.id, x, y, r, mine) >= 0) {
        this.push(wr, x - fx);
        this.push(wr, y - fy);
        this.push(wr, 1);
        return;
      }
    }
    this.push(wr, 0);
    this.push(wr, 0);
    this.push(wr, 0);
  }
  opRead(wr) {
    const dy = this.pop(wr), dx = this.pop(wr);
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    if (!this.inBounds(x, y) || this.owner[this.idx(x, y)] === NONE || this.seer(wr.id, x, y) < 0) {
      this.push(wr, -1);
      return;
    }
    this.push(wr, this.code[this.idx(x, y)]);
  }
  // ---------- actions ----------
  opShift(wr, d) {
    d = (d % 4 + 4) % 4;
    const mine = this.cellsOf(wr.id);
    for (const c of mine) {
      const nx = c % this.w + DX[d], ny = (c / this.w | 0) + DY[d];
      if (this.ownerAt(nx, ny) === wr.id) continue;
      if (!this.passable(wr, nx, ny)) return false;
    }
    if (CONFIG.island && wr.realm === 1) {
      for (const c of mine) {
        const t = c + DY[d] * this.w + DX[d];
        if (this.owner[t] !== DEBRIS) continue;
        this.setOwner(t, NONE);
        this.code[t] = 0;
        wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + CONFIG.seaFeed);
        wr.stats.collected++;
      }
    }
    const codes = mine.map((c) => this.code[c]);
    for (const c of mine) {
      this.owner[c] = NONE;
      this.code[c] = 0;
    }
    const delta = DY[d] * this.w + DX[d];
    const moved = mine.map((c) => c + delta);
    for (let k = 0; k < moved.length; k++) {
      this.owner[moved[k]] = wr.id;
      this.code[moved[k]] = codes[k];
    }
    this.cellSets.set(wr.id, new Set(moved));
    this.sortedCells.set(wr.id, moved);
    wr.ipX += DX[d];
    wr.ipY += DY[d];
    wr.ox += DX[d];
    wr.oy += DY[d];
    return true;
  }
  /**
   * OOZE: amoeboid movement, one cell at a time. My rearmost cell (least far along d) that
   * can leave without splitting the body moves, code and all, to the free floor touching
   * the rest of the body that is farthest along d (ties: nearest my body's middle across
   * d). It must end up farther along d than it was. Repeated, a body pours itself through
   * any gap, its program rearranged on the way. The IP and the frame origin ride the cell
   * under them.
   */
  opOoze(wr, d) {
    d = (d % 4 + 4) % 4;
    const id = wr.id, w = this.w;
    const mine = this.cellsOf(id);
    if (mine.length < 2) return this.opShift(wr, d);
    const along = (c) => c % w * DX[d] + (c / w | 0) * DY[d];
    const across = (c) => c % w * DY[d] - (c / w | 0) * DX[d];
    let mid = 0;
    for (const c of mine) mid += across(c);
    mid /= mine.length;
    const order = mine.slice().sort((a, b) => along(a) - along(b) || a - b);
    const mineSet = this.cellSets.get(id);
    for (const src of order) {
      const rest = mine.length - 1;
      const start = mine[0] === src ? mine[1] : mine[0];
      const seen = /* @__PURE__ */ new Set([start]);
      const queue = [start];
      while (queue.length) {
        const c = queue.pop();
        const x = c % w, y = c / w | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.inBounds(nx, ny)) continue;
          const n = ny * w + nx;
          if (n !== src && mineSet.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      if (seen.size !== rest) continue;
      let best = -1, bestAlong = along(src), bestAcross = Infinity;
      for (const c of mine) {
        if (c === src) continue;
        const x = c % w, y = c / w | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.isFree(nx, ny) || this.sharkBlocked(wr, ny)) continue;
          const t = ny * w + nx;
          const a = along(t), off = Math.abs(across(t) - mid);
          if (a > bestAlong || a === bestAlong && best >= 0 && (off < bestAcross || off === bestAcross && t < best)) {
            if (a > along(src)) {
              best = t;
              bestAlong = a;
              bestAcross = off;
            }
          }
        }
      }
      if (best < 0) return false;
      this.setOwner(best, id);
      this.code[best] = this.code[src];
      this.setOwner(src, NONE);
      this.code[src] = 0;
      const bx = best % w, by = best / w | 0, sx = src % w, sy = src / w | 0;
      if (wr.ipX === sx && wr.ipY === sy) {
        wr.ipX = bx;
        wr.ipY = by;
      }
      if (wr.ox === sx && wr.oy === sy) {
        wr.ox = bx;
        wr.oy = by;
      }
      wr.stats.oozes++;
      return true;
    }
    return false;
  }
  opFlow(wr, dx, dy, d) {
    d = (d % 4 + 4) % 4;
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const nx = x + DX[d], ny = y + DY[d];
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny) || this.sharkBlocked(wr, ny)) return false;
    const from = this.idx(x, y), to = this.idx(nx, ny);
    const isIp = x === wr.ipX && y === wr.ipY;
    this.setOwner(to, wr.id);
    this.code[to] = this.code[from];
    this.setOwner(from, NONE);
    this.code[from] = 0;
    if (isIp) {
      wr.ipX = nx;
      wr.ipY = ny;
    }
    if (this.unreached(wr).length) {
      this.setOwner(from, wr.id);
      this.code[from] = this.code[to];
      this.setOwner(to, NONE);
      this.code[to] = 0;
      if (isIp) {
        wr.ipX = x;
        wr.ipY = y;
      }
      return false;
    }
    wr.stats.flows++;
    return true;
  }
  opSwap(wr, dx1, dy1, dx2, dy2) {
    const [fx, fy] = this.frame(wr);
    const a = [fx + dx1, fy + dy1], b = [fx + dx2, fy + dy2];
    if (this.ownerAt(a[0], a[1]) !== wr.id || this.ownerAt(b[0], b[1]) !== wr.id) return false;
    const ia = this.idx(a[0], a[1]), ib = this.idx(b[0], b[1]);
    if (this.code[ia] !== this.code[ib]) wr.stats.swaps++;
    [this.code[ia], this.code[ib]] = [this.code[ib], this.code[ia]];
    return true;
  }
  /** Fat only: growth is size (and a buffer that sheds first), never new code to run into. */
  opGrow(wr, d) {
    d = (d % 4 + 4) % 4;
    if (wr.cellCount >= Math.floor(wr.maxSize)) return false;
    let x = wr.ipX, y = wr.ipY;
    while (this.ownerAt(x, y) === wr.id) {
      x += DX[d];
      y += DY[d];
    }
    if (!this.isFree(x, y) || this.sharkBlocked(wr, y)) return false;
    const i = this.idx(x, y);
    this.setOwner(i, wr.id);
    this.code[i] = CODE["."];
    wr.cellCount++;
    wr.stats.grows++;
    return true;
  }
  opCollect(wr) {
    let got = false;
    for (const c of this.cellsOf(wr.id)) {
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!this.inBounds(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (CONFIG.island && (wr.realm ? this.owner[i] !== DEBRIS : this.owner[i] === DEBRIS)) continue;
        if (this.resource[i] === 1) {
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + (CONFIG.island ? CONFIG.kelpFeed : CONFIG.sizePickup) * this.ripe[i]);
          this.log("collect", `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log("collect", `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
        } else if (this.owner[i] === DEBRIS) {
          wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + (CONFIG.island ? CONFIG.seaFeed : CONFIG.debrisPickup));
          this.setOwner(i, NONE);
          this.code[i] = 0;
          if (CONFIG.island) wr.stats.collected++;
          got = true;
          continue;
        } else continue;
        this.resource[i] = 0;
        wr.stats.collected++;
        got = true;
      }
    }
    return got;
  }
  /**
   * BOMB with an empty stack: the visible foreign cell (another warrior's) nearest my IP,
   * within range, skipping cells that hold a glyph my own body has. Kin recognition: a
   * near-copy of me is immune, a stranger is hit where it differs from me (and a warrior
   * that carries my glyphs, a mimic, is spared). Island survival: only the other realm.
   */
  opBombNearest(wr) {
    const R = this.reach(wr);
    const mine = new Uint8Array(GLYPHS.length + 1);
    for (const c of this.cellsOf(wr.id)) mine[this.code[c]] = 1;
    let best = -1, bx = 0, by = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = wr.ipX + dx, y = wr.ipY + dy, d = Math.abs(dx) + Math.abs(dy);
        if (best >= 0 && d >= best) continue;
        const o = this.ownerAt(x, y);
        if (o < 0 || o === wr.id || mine[this.code[this.idx(x, y)]] || this.seer(wr.id, x, y, R) < 0) continue;
        if (CONFIG.island && this.warriors[o].realm === wr.realm) continue;
        if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) continue;
        best = d;
        bx = x;
        by = y;
      }
    }
    return best >= 0 && this.opBombAt(wr, bx, by);
  }
  /** BOMB reach: island sharks bite (CONFIG.biteRange) rather than shoot. */
  reach(wr) {
    return CONFIG.island && wr.realm === 1 ? CONFIG.biteRange : CONFIG.bombRange;
  }
  opBombAt(wr, x, y) {
    if (CONFIG.island && wr.realm === 1 && wr.maxSize >= CONFIG.sharkFull * CONFIG.sharkCap) return false;
    const o = this.ownerAt(x, y);
    if (CONFIG.island && wr.realm === 1 && o >= 0 && this.warriors[o].realm === 1) return false;
    if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) return false;
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, this.reach(wr)) < 0) return false;
    const victim = o >= 0 ? this.warriors[o].name : "debris";
    if (o >= 0) this.attacks.bombs++;
    if (o >= 0 && this.warriors[o].lineage !== wr.lineage) wr.stats.bombHits++;
    this.destroy(this.idx(x, y), wr);
    this.log("bomb", `${wr.name} bombed ${victim}`, wr.id);
    return true;
  }
  /**
   * DIVIDE: copy my whole body beyond itself in direction d, as a new warrior of my lineage
   * (a rival like any other in play).
   * Needs max size ≥ 2× my cells (and ≥ divideMin); parent and child each get half the
   * max size, the same speed, and a fresh stack. Each copied cell becomes a random glyph
   * with chance CONFIG.copyError: variation, so a lineage can evolve within one match.
   */
  opDivide(wr, d) {
    d = (d % 4 + 4) % 4;
    if (wr.maxSize < (CONFIG.island ? 3 : 2) * wr.cellCount || wr.maxSize < CONFIG.divideMin) return false;
    if (CONFIG.reaperCap > 0) {
      const living = this.living();
      if (living.length >= CONFIG.reaperCap) {
        const oldest = living.filter((w) => w !== wr).reduce((a, w) => w.born < a.born ? w : a);
        this.kill(oldest, "reaped (oldest)");
      }
    } else if (this.living().length >= CONFIG.maxWarriors) return false;
    const mine = this.cellsOf(wr.id);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => c / this.w | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1);
    for (let k = 0; k < mine.length; k++) if (!this.passable(wr, xs[k] + ox, ys[k] + oy)) return false;
    const steps = Math.abs(ox) + Math.abs(oy);
    for (let k = 0; k < mine.length; k++) {
      for (let s = 1; s < steps; s++) if (this.board.terrain[this.idx(xs[k] + DX[d] * s, ys[k] + DY[d] * s)] !== FLOOR) return false;
    }
    const id = this.warriors.length;
    const founder = this.warriors[wr.lineage];
    const born = this.bornIn.get(wr.lineage) ?? 1;
    this.bornIn.set(wr.lineage, born + 1);
    const child = {
      id,
      lineage: wr.lineage,
      gen: wr.gen + 1,
      realm: wr.realm,
      parent: wr.id,
      born: this.t,
      name: `${founder.name}\xB7${born}`,
      alive: true,
      ipX: wr.ipX + ox,
      ipY: wr.ipY + oy,
      ox: wr.ox + ox,
      oy: wr.oy + oy,
      dir: wr.dir,
      stack: [],
      maxSize: wr.maxSize / 2,
      speed: wr.speed,
      accum: 0,
      lastOk: true,
      lastAct: "",
      cellCount: 0,
      executed: 0,
      spec: wr.spec,
      home: wr.home,
      roomsSeen: new Set(wr.roomsSeen),
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }
    };
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(this.lifeOf(child.realm) * (0.5 + this.rng()));
    const cx0 = Math.min(...xs) + ox, cx1 = Math.max(...xs) + ox, cy0 = Math.min(...ys) + oy, cy1 = Math.max(...ys) + oy;
    this.board.rooms.forEach((r, k) => {
      if (cx0 >= r.x && cy0 >= r.y && cx1 < r.x + r.w && cy1 < r.y + r.h) child.roomsSeen.add(k);
    });
    this.warriors.push(child);
    this.livingList.push(child);
    let mutations = 0;
    for (let k = 0; k < mine.length; k++) {
      const i = this.idx(xs[k] + ox, ys[k] + oy);
      let code = this.code[mine[k]];
      if (this.rng() < CONFIG.copyError) {
        code = Math.floor(this.rng() * GLYPHS.length);
        mutations++;
      }
      this.setOwner(i, id);
      this.code[i] = code;
      child.cellCount++;
    }
    if (CONFIG.copyInsert > 0 && this.rng() < CONFIG.copyInsert) {
      const kids = this.cellsOf(id);
      const c = kids[Math.floor(this.rng() * kids.length)], d2 = Math.floor(this.rng() * 4);
      const nx = c % this.w + DX[d2], ny = (c / this.w | 0) + DY[d2];
      if (this.isFree(nx, ny)) {
        const i = this.idx(nx, ny);
        this.setOwner(i, id);
        this.code[i] = CODE["."];
        child.cellCount++;
        mutations++;
      }
    }
    if (CONFIG.copyDelete > 0 && child.cellCount > 1 && this.rng() < CONFIG.copyDelete) {
      const ip = this.idx(child.ipX, child.ipY);
      const kids = this.cellsOf(id).filter((c2) => c2 !== ip);
      const c = kids[Math.floor(this.rng() * kids.length)];
      this.setOwner(c, NONE);
      if (this.unreached(child).length === 0) {
        this.code[c] = 0;
        child.cellCount--;
        mutations++;
      } else this.setOwner(c, id);
    }
    wr.maxSize /= 2;
    this.log("birth", `${wr.name} divided: ${child.name} (generation ${child.gen}${mutations ? `, ${mutations} mutation${mutations > 1 ? "s" : ""}` : ""})`, id);
    return true;
  }
  opWrite(wr, dx, dy, code) {
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE) return false;
    if (o !== wr.id) {
      if (this.seer(wr.id, x, y, CONFIG.writeRange) < 0) return false;
    }
    const c = (code % GLYPHS.length + GLYPHS.length) % GLYPHS.length;
    if (o === wr.id && this.code[this.idx(x, y)] !== c) wr.stats.selfWrites++;
    this.code[this.idx(x, y)] = c;
    if (o >= 0 && o !== wr.id) {
      if (c === CODE["@"]) this.attacks.poisons++;
      if (c === CODE["@"] && this.warriors[o].lineage !== wr.lineage) wr.stats.poisonWrites++;
      if (o >= 0) this.warriors[o].lastHarm = { by: wr.id, t: this.t };
      this.log("write", `${wr.name} wrote '${GLYPHS[c]}' into ${this.warriors[o].name}`, wr.id);
    }
    return true;
  }
};

// src/sim/fingerprint.ts
var TICKS = 2e3;
var CHECKPOINT = 50;
function fnv(h, v) {
  h ^= v & 255;
  h = Math.imul(h, 16777619);
  h ^= v >>> 8 & 255;
  h = Math.imul(h, 16777619);
  h ^= v >>> 16 & 255;
  h = Math.imul(h, 16777619);
  h ^= v >>> 24 & 255;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}
var fnum = (h, x) => fnv(fnv(h, Math.floor(x * 1e6)), Math.floor(x * 1e6 / 4294967296));
var fstr = (h, s) => {
  for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i));
  return h;
};
function stateHash(w, h) {
  h = fnv(h, w.t);
  for (let i = 0; i < w.owner.length; i++) {
    h = fnv(h, w.owner[i]);
    h = fnv(h, w.code[i]);
    h = fnv(h, w.resource[i]);
  }
  for (const x of w.warriors) {
    for (const v of [
      x.alive ? 1 : 0,
      x.ipX,
      x.ipY,
      x.ox,
      x.oy,
      x.dir,
      x.cellCount,
      x.executed,
      x.lastOk ? 1 : 0,
      x.diedAt ?? -1,
      x.stats.collected,
      x.stats.bombHits,
      x.stats.poisonWrites,
      x.stats.kills,
      x.leftHomeAt ?? -1,
      x.lastHarm?.by ?? -1,
      x.lastHarm?.t ?? -1
    ]) h = fnv(h, v);
    h = fnum(fnum(fnum(h, x.maxSize), x.speed), x.accum);
    h = fstr(h, x.lastAct + (x.deathReason ?? ""));
    h = fnv(h, x.stack.length);
    for (const v of x.stack) h = fnv(h, v);
  }
  h = fnv(h, w.events.length);
  const e = w.events[w.events.length - 1];
  if (e) h = fstr(h, `${e.t}${e.kind}${e.text}`);
  h = fstr(h, w.result.reason);
  return h;
}
function replay(c, glyphs) {
  const specs = c.sources.map((s) => parseWarrior(s));
  const w = new World(c.seed, specs);
  let h = 2166136261;
  const checkpoints = [];
  for (let t = 0; t < TICKS && !w.result.over; t++) {
    w.tick();
    h = stateHash(w, h);
    if (w.t % CHECKPOINT === 0) checkpoints.push(h);
    if (glyphs) {
      for (const x of w.warriors) if (x.alive) glyphs[x.lastAct] = (glyphs[x.lastAct] ?? 0) + 1;
    }
  }
  return { name: `${specs.map((s) => s.name).join(" vs ")} @${c.seed}`, ticks: w.t, checkpoints, final: h };
}

// src/sim/match.ts
function runMatch(specs, seed, opts = {}) {
  const prevCap = CONFIG.tickCap;
  if (opts.tickCap) CONFIG.tickCap = opts.tickCap;
  try {
    const world = new World(seed, specs);
    while (!world.result.over) {
      world.tick();
      opts.onTick?.(world);
    }
    return { world, summary: summarize(world) };
  } finally {
    CONFIG.tickCap = prevCap;
  }
}
function summarize(world) {
  return {
    seed: world.seed,
    ticks: world.t,
    winner: world.result.winner === null ? null : world.warriors[world.result.winner].name,
    reason: world.result.reason,
    warriors: world.warriors.map((w) => ({
      name: w.name,
      alive: w.alive,
      cells: w.cellCount,
      executed: w.executed,
      death: w.deathReason
    }))
  };
}

// src/ga/job.ts
function runJob(j) {
  const me = j.me;
  try {
    const specs = j.warriors.map((t) => parseWarrior(t));
    const { world } = runMatch(specs, j.seed, { tickCap: j.ticks });
    const team = world.warriors.filter((x) => x.lineage === me);
    const sum = (f) => team.reduce((a, x) => a + f(x), 0);
    const alive = team.some((x) => x.alive);
    const w = {
      alive,
      diedAt: alive ? void 0 : Math.max(...team.map((x) => x.diedAt ?? 0)),
      leftHomeAt: team.some((x) => x.leftHomeAt !== void 0) ? 0 : void 0,
      stats: {
        collected: sum((x) => x.stats.collected),
        bombHits: sum((x) => x.stats.bombHits),
        poisonWrites: sum((x) => x.stats.poisonWrites),
        kills: sum((x) => x.stats.kills),
        morph: sum((x) => x.stats.oozes + x.stats.flows + x.stats.grows),
        squeezed: sum((x) => x.stats.squeezed),
        rooms: sum((x) => x.stats.rooms)
      }
    };
    const r = world.result;
    let score = 0;
    if (r.winner === me) score = r.reason === "last standing" ? 3 : 2;
    else if (r.winner === null) score = 1;
    score += Math.min(0.5, 0.05 * w.stats.collected);
    score += Math.min(1, 0.1 * w.stats.bombHits);
    score += Math.min(1, 0.25 * w.stats.poisonWrites);
    score += Math.min(1, 0.5 * w.stats.kills);
    score += Math.min(1, 0.5 * w.stats.rooms);
    score += 0.5 * ((w.alive ? world.t : w.diedAt ?? 0) / world.t);
    return {
      score,
      win: r.winner === me,
      loss: r.winner !== null && r.winner !== me,
      kill: world.warriors.some((x) => x.gen === 0 && !world.warriors.some((y) => y.lineage === x.lineage && y.alive)),
      hits: w.stats.bombHits,
      poisons: w.stats.poisonWrites,
      collected: w.stats.collected,
      left: w.leftHomeAt !== void 0,
      morph: w.stats.morph,
      squeezed: w.stats.squeezed > 0,
      rooms: w.stats.rooms
    };
  } catch {
    return { score: 0, win: false, loss: true, kill: false, hits: 0, poisons: 0, collected: 0, left: false, morph: 0, squeezed: false, rooms: 0 };
  }
}
function runBatch(b) {
  return b.jobs.map((j) => runJob({ warriors: j.w.map((k) => b.warriors[k]), me: j.me, seed: j.seed, ticks: j.ticks }));
}

// src/sim/dish.ts
var DISH_DEFAULTS = {
  size: 160,
  // plate diameter (cells)
  bands: 5,
  // toxin levels 0 (middle) … 4 (rim)
  food: 5,
  // about one food spot per food² cells
  spawn: 40,
  // ticks a food spot needs untouched to regrow
  ripen: 300,
  // an uneaten pickup grows one pickup's worth every this many ticks…
  ripemax: 5,
  // …up to this many (so fresh territory is rich, picked-over ground poor)
  toxin: 1e-3,
  // per tick, a cell's chance of dying one toxin level above its warrior's armor…
  step: 10,
  // …times this for each further level
  error: 0.02,
  // DIVIDE: chance each copied cell becomes a random glyph
  insert: 0.02,
  // DIVIDE: chance the child gains a fat cell
  delete: 0.02,
  // DIVIDE: chance the child loses a cell
  life: 6e3,
  // typical lifespan (each warrior's is 50–150% of it)
  cap: 0,
  // most warriors alive at once (DIVIDE fails at the cap); 0 = no cap: food and space decide
  island: 0,
  // 1 = island survival (side view: islanders and sea creatures; size = width)
  starve: 600,
  // island: ticks an unfed seal with max size 20 lasts
  sharkstarve: 6e3,
  // island: the same for a shark (10×, like its lifespan)
  sharklife: 10,
  // island: shark lifespan, times a seal's
  kelp: 8,
  // island: max size a seal gains per kelp (times ripeness)
  seafeed: 3,
  // island: max size a sea creature gains per dead cell (and per cell of a seal it kills)
  bite: 2,
  // island: a shark's BOMB reach
  full: 0.75,
  // island: a shark at this share of its size cap is full and won't bite
  shallows: 0.4,
  // island: top share of the water sharks can't enter
  calm: 0.35,
  // island: top share of the water with no pressure
  depth: 0.75,
  // island: sea depth as a share of its width
  arrive: 6e4,
  // island: tick the reef channel opens and the sharks swim in
  seals: 60
  // island: seals already spread through the calm water at the start
};
function applyDish(get) {
  const o = {};
  for (const [k, d] of Object.entries(DISH_DEFAULTS)) {
    const v = get(k);
    o[k] = v !== null && v !== "" ? Number(v) : d;
  }
  if (o.island > 0) {
    const unset = (k) => (get(k) ?? "") === "";
    if (unset("size")) o.size = 360;
    if (unset("ripen")) o.ripen = 250;
    if (unset("ripemax")) o.ripemax = 8;
    if (unset("toxin")) o.toxin = 5e-3;
  }
  CONFIG.plate = o.size;
  CONFIG.plateBands = o.bands;
  CONFIG.plateFood = o.food;
  CONFIG.spawnInterval = o.spawn;
  CONFIG.foodRipen = o.ripen;
  CONFIG.foodRipeMax = o.ripemax;
  CONFIG.toxinRate = o.toxin;
  CONFIG.toxinStep = o.step;
  CONFIG.copyError = o.error;
  CONFIG.copyInsert = o.insert;
  CONFIG.copyDelete = o.delete;
  CONFIG.lifespan = o.life;
  CONFIG.maxWarriors = o.cap > 0 ? o.cap : Infinity;
  CONFIG.island = o.island > 0;
  CONFIG.starve = o.starve;
  CONFIG.sharkStarve = o.sharkstarve;
  CONFIG.sharkLife = o.sharklife;
  CONFIG.kelpFeed = o.kelp;
  CONFIG.seaFeed = o.seafeed;
  CONFIG.biteRange = o.bite;
  CONFIG.sharkFull = o.full;
  CONFIG.shallows = o.shallows;
  CONFIG.calm = o.calm;
  CONFIG.depth = o.depth;
  CONFIG.sharkArrive = o.arrive;
  CONFIG.seals = o.seals;
  CONFIG.reaperCap = 0;
  CONFIG.tickCap = 1e12;
  CONFIG.endless = true;
  return o;
}
var K2 = CODE["K"];
function armorOf(world, id) {
  let n = 0;
  for (const c of world.cellsOf(id)) if (world.code[c] === K2) n++;
  return n;
}
function bandOf(world, id) {
  const w = world.warriors[id];
  return world.board.toxin?.[world.idx(w.ipX, w.ipY)] ?? 0;
}
function genomeOf(world, id, sep = "/") {
  const cells = world.cellsOf(id);
  if (!cells.length) return "";
  const xs = cells.map((c) => c % world.w), ys = cells.map((c) => c / world.w | 0);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let r = "";
    for (let x = x0; x <= x1; x++) {
      const i = world.idx(x, y);
      r += world.owner[i] === id ? glyphOf(world.code[i]) : " ";
    }
    rows.push(r.replace(/\s+$/, ""));
  }
  return rows.join(sep);
}
var WEAPON = { B: CODE["B"], W: CODE["W"], poison: CODE["@"] };
function dishSnapshot(world, founders) {
  const all = world.living();
  const living = all.filter((w) => w.realm === 0);
  const bands = new Array(CONFIG.plateBands).fill(0), armor = [];
  const counts = /* @__PURE__ */ new Map();
  const weapons = { B: 0, W: 0, poison: 0 };
  const shapes = /* @__PURE__ */ new Map(), glyphs = {};
  const acts = { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0 };
  for (const w of living) {
    bands[bandOf(world, w.id)]++;
    const a = armorOf(world, w.id);
    armor[a] = (armor[a] ?? 0) + 1;
    const g = genomeOf(world, w.id);
    counts.set(g, (counts.get(g) ?? 0) + 1);
    const outline = g.replace(/[^ /]/g, "#");
    shapes.set(outline, (shapes.get(outline) ?? 0) + 1);
    for (const ch of new Set(g.replace(/[ /]/g, ""))) glyphs[ch] = (glyphs[ch] ?? 0) + 1;
    for (const k in acts) acts[k] += w.stats[k] / living.length;
    const cells = world.cellsOf(w.id);
    for (const k of ["B", "W", "poison"]) if (cells.some((c) => world.code[c] === WEAPON[k])) weapons[k]++;
  }
  for (let a = 0; a < armor.length; a++) armor[a] ??= 0;
  const deaths = {};
  for (const w of world.warriors) {
    if (w.alive || !w.deathReason) continue;
    const k = w.deathReason.replace(/ by .*/, "").replace(/ \(.*/, "");
    deaths[k] = (deaths[k] ?? 0) + 1;
  }
  return {
    t: world.t,
    alive: living.length,
    births: world.warriors.length - founders,
    maxGen: Math.max(0, ...living.map((w) => w.gen)),
    bands,
    armor,
    deaths,
    weapons,
    attacks: { ...world.attacks },
    top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    shapes: [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    distinct: counts.size,
    glyphs,
    acts,
    body: {
      mean: living.reduce((a, w) => a + w.cellCount, 0) / Math.max(1, living.length),
      max: Math.max(0, ...living.map((w) => w.cellCount)),
      genome: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0].replace(/[ /]/g, "").length ?? 0,
      grows: living.reduce((a, w) => a + w.stats.grows, 0) / Math.max(1, living.length)
    },
    sea: CONFIG.island ? seaSnapshot(world, all.filter((w) => w.realm === 1)) : void 0
  };
}
function seaSnapshot(world, sea) {
  const bands = new Array(CONFIG.plateBands).fill(0), armor = [], counts = /* @__PURE__ */ new Map();
  for (const w of sea) {
    bands[bandOf(world, w.id)]++;
    const a = armorOf(world, w.id);
    armor[a] = (armor[a] ?? 0) + 1;
    const g = genomeOf(world, w.id);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  for (let a = 0; a < armor.length; a++) armor[a] ??= 0;
  return { alive: sea.length, bands, armor, top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

// src/work.ts
var DEFAULTS = { ...CONFIG };
function runWork(w) {
  Object.assign(CONFIG, DEFAULTS);
  switch (w.kind) {
    case "matches":
      return runBatch(w.batch);
    case "match":
      return playMatch(w.warriors, w.names, w.seed, w.ticks);
    case "solo":
      return playSolo(w.warrior, w.seed, w.ticks);
    case "dish":
      return playDish(w);
  }
}
function playMatch(texts, names, seed, ticks) {
  CONFIG.tickCap = ticks;
  const world = new World(seed, texts.map((t, i) => parseWarrior(t, names?.[i])));
  while (!world.result.over) world.tick();
  return { summary: summarize(world), kills: world.warriors.map((x) => x.stats.kills) };
}
function playSolo(text, seed, ticks) {
  CONFIG.tickCap = ticks;
  const world = new World(seed, [parseWarrior(text)]);
  let peak = 0;
  const cells = () => world.living().reduce((a, x) => a + x.cellCount, 0);
  while (!world.result.over) {
    world.tick();
    peak = Math.max(peak, cells());
  }
  const team = world.warriors, sum = (f) => team.reduce((a, x) => a + f(x), 0);
  return {
    pickups: sum((x) => x.stats.collected),
    oozes: sum((x) => x.stats.oozes),
    flows: sum((x) => x.stats.flows),
    grows: sum((x) => x.stats.grows),
    peak,
    final: cells(),
    left: team.some((x) => x.leftHomeAt !== void 0),
    squeezed: team.some((x) => x.stats.squeezed > 0),
    room: team.some((x) => x.stats.rooms > 0),
    alive: team.some((x) => x.alive)
  };
}
function playDish(w) {
  applyDish((k) => w.settings[k] ?? null);
  const specs = w.warriors.map((t) => parseWarrior(t));
  const world = new World(w.seed, specs);
  const founder = genomeOf(world, 0);
  const snapshots = [];
  while (world.t < w.ticks && world.living().length) {
    world.tick();
    if (world.t % w.report === 0) snapshots.push(dishSnapshot(world, specs.length));
  }
  if (world.t % w.report !== 0) snapshots.push(dishSnapshot(world, specs.length));
  return { founder, snapshots, extinct: world.living().length === 0 };
}

// src/farm-task.ts
function run(input) {
  return runWork(input);
}
function canary() {
  const cases = canary_default;
  let bad = 0;
  for (const c of cases) {
    const r = replay(c.case);
    if (r.final !== c.final || r.ticks !== c.ticks) bad++;
  }
  return { ok: bad === 0, detail: bad ? `${bad}/${cases.length} replays differ` : `${cases.length} replays identical` };
}
export {
  canary,
  run
};
