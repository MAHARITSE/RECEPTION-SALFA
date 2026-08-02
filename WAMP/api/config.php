<?php
/**
 * Configuration MySQL de RECEPTION SALFA — version WAMP.
 * ======================================================
 * Installation WAMP standard : utilisateur `root` SANS mot de passe.
 * On se connecte à `127.0.0.1` (et non `localhost`) : sous Windows/WAMP,
 * `localhost` peut être résolu en IPv6 (`::1`) et provoquer une erreur
 * « Connexion impossible » alors que MySQL n'écoute qu'en IPv4 — c'est la
 * même astuce que LogBara / Bar POS.
 *
 * Modifiez ces valeurs si votre MySQL utilise un autre compte, un autre port
 * ou un mot de passe.
 */
return [
    'host'     => '127.0.0.1',   // ← IP IPv4 fiable (évite le bug `::1`)
    'port'     => 3306,
    'database' => 'reception_salfa',
    'username' => 'root',
    'password' => '',
    'charset'  => 'utf8mb4',
    'debug'    => true,          // false en production (masque les messages MySQL)
];
