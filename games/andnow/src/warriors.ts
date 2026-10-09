// Warriors bundled into the browser build (esbuild loads .warrior files as text).
import bomber from '../warriors/bomber.warrior';
import gatherer from '../warriors/gatherer.warrior';
import roamer from '../warriors/roamer.warrior';
import stalker from '../warriors/stalker.warrior';
import turtle from '../warriors/turtle.warrior';
import viper from '../warriors/viper.warrior';

export const BUNDLED: Record<string, string> = { bomber, gatherer, roamer, stalker, turtle, viper };
