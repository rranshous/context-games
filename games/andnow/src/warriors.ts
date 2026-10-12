// Warriors bundled into the browser build (esbuild loads .warrior files as text).
import amoeba from '../warriors/amoeba.warrior';
import bomber from '../warriors/bomber.warrior';
import gatherer from '../warriors/gatherer.warrior';
import roamer from '../warriors/roamer.warrior';
import shark from '../warriors/shark.warrior';
import stalker from '../warriors/stalker.warrior';
import turtle from '../warriors/turtle.warrior';
import viper from '../warriors/viper.warrior';

export const BUNDLED: Record<string, string> = { amoeba, bomber, gatherer, roamer, shark, stalker, turtle, viper };
