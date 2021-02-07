<template>
  <div>
    <p>🎧 dSong fue un proyecto web sin ánimo de lucro fundado el 18 de Mayo de 2009, en el que un grupo de amigos nos propusimos escribir una recomendación musical diaria.</p>

    <p>✍🏼 A lo largo de 8 años publicamos cerca de 2.000 artículos. Durante un tiempo también colaboramos con <a href="https://uniradio.ujaen.es/" target="_blank">UniRadio Jaén</a>, grabando 335 podcasts narrando algunas de las recomendaciones de la web.</p>

    <p>⌛️ A principios de 2017 publicamos el último artículo. En <a href="https://web.archive.org/web/20170501000000*/http://www.dsong.es" target="_blank">archive.org</a> se pueden seguir consultando algunas capturas de la web original.</p>

    <p>💻 Era una pena que todo este contenido se perdiese en un disco duro de copias de seguridad, así que hemos creado este pequeño proyecto para que se pueda seguir consultando más allá del típico formato blog que un día fue. En el <router-link :to="{ name: 'archive' }">Archivo</router-link> puedes encontrar una tabla con todo el contenido, filtrarlo y ordenarlo por distintos criterios. También puedes <router-link :to="{ name: 'lucky' }"><img src="../assets/dices.png" alt="Dados" class="header__menu--dices"> navegar a tu suerte</router-link>, y ver qué te vamos recomendando de entre todo el histórico de publicaciones.</p>

    <p>🤝 Todos los contenidos de este sitio continuan estando publicados bajo una licencia <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/es/" target="_blank">«Creative Commons Reconocimiento-No comercial-Compartir bajo la misma licencia 3.0 España»</a>. Puedes darle un uso no comercial, siempre y cuando reconozcas la autoría y compartas con el mismo tipo de licencia.</p>

    <p>📨 Si encuentras alguna errata, una publicación mal formateada, enlaces rotos o algún reproductor que no funciona puedes <a href="mailto:dsong@jesusmagamu.dev">escribir un email a dsong@jesusmagamu.dev</a>, <a href="https://github.com/skuark/dsong-archive" target="_blank">abrir una issue en GitHub</a> o mandar un PR con la corrección.</p>
  </div>
</template>
