// Removes the thin white lines along map tile edges. When the screen or
// browser zoom is not a whole-number scale (125%, 150%, common on Windows
// laptops), tile edges land between device pixels. Leaflet 1.9 draws tiles
// with `mix-blend-mode: plus-lighter`, which adds the colours of tiles that
// share an edge pixel, so light map areas turn white there; where tiles fall
// short of each other, a gap shows instead. Drawing each tile 1px larger makes
// neighbours overlap, and normal blending lets the top tile simply cover the
// one under it. Applies to every Leaflet map on the page; import this before
// creating one.
const initTile = L.GridLayer.prototype._initTile;

L.GridLayer.include({
  _initTile(tile) {
    initTile.call(this, tile);
    const size = this.getTileSize();
    tile.style.width = `${size.x + 1}px`;
    tile.style.height = `${size.y + 1}px`;
    tile.style.mixBlendMode = 'normal';
  },
});
