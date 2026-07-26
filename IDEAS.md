* Les conditions/états sur l'écran de joueurs ne sont probablement pas alignées avec celles ajoutées dans contenu, il faudrait uniformsier les 2 sources.

* MAJ la vue joueur pour permettre toutes les recherches comme pour le MJ (donc accès à tout le contenu, avec recherche globale, sauf en mode demo)

* Certains sorts, ont un rendu custom avec des tableaux etc, mais ce rendu est perdu dans les données JSON. Il faudrait faire une repasse et identifier le contenu  (objets magiques et sorts) qui doit être reformaté. Ex : Anneau de feu d'étoiles est très bien rendu, mais pas Anneau de contrôle des élémentaires
* * De plus les objets magiques ont des liens vers des sorts de Aidednd, il faut remplacer celà par des liens internes

* La recherche cherche aussi dans le contenu custom : nom et label des images, vidéos, marchands, audio, cartes, ... et  a côté de chaque résultat il y a un bouton pour l'afficher sur la TV directement

* Le puzzle peut s'afficher sur la TV mais ce n'est pas un des choix possible sur menu de droite. Il faudrait corriger.

* Implémenter un nouveau thème. Pour le test, inspire toi de https://dd2024.fr/. Observe la charte graphique, recupère les couleurs clés, etc, et fait en un thème en plus de sombre et clair (le switch "toggle" devra donc évoluer). Ne recuprèe aucun logo ou autre. 
