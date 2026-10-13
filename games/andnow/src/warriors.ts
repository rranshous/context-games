// Warriors bundled into the browser build (esbuild loads .warrior files as text).
import amoeba from '../warriors/amoeba.warrior';
import bomber from '../warriors/bomber.warrior';
import climber from '../warriors/climber.warrior';
import diver from '../warriors/diver.warrior';
import gatherer from '../warriors/gatherer.warrior';
import hunter from '../warriors/hunter.warrior';
import roamer from '../warriors/roamer.warrior';
import shark from '../warriors/shark.warrior';
import stalker from '../warriors/stalker.warrior';
import turtle from '../warriors/turtle.warrior';
import viper from '../warriors/viper.warrior';

export const BUNDLED: Record<string, string> = { amoeba, bomber, climber, diver, gatherer, hunter, roamer, shark, stalker, turtle, viper };
