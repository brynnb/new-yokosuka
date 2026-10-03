import { Badge, Button, Card, Dialog, Flex, IconButton, Kbd, Text } from '@radix-ui/themes';
import { useEffect, useRef, useState } from 'react';
import { formatControlBinding, generalPreferences } from '../../settings/GeneralPreferences.js';

// Load Babylon only when the collection is actually opened.
const loadPreview = () => import('../CapsuleToyPreview.js');

export function CollectionToyCard({item, thumbnails, onSelect}) {
  const cardRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || image) return;
    const controller = new AbortController();
    thumbnails.then(pool => pool.get(item.key, controller.signal)).then(url => {
      if (!controller.signal.aborted) setImage(url);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [visible, image, item.key, thumbnails]);
  return <Card asChild size="2" variant="surface" className="inventory-entry collection-toy-card">
    <button ref={cardRef} type="button" onClick={() => onSelect(item)} aria-label={`Inspect ${item.name}`}>
      <span className="collection-toy-thumbnail" aria-hidden="true">
        {image ? <img src={image} alt="" draggable={false} />
          : <Text size="1" color="gray">{failed ? 'Preview unavailable · click to retry' : 'Loading preview…'}</Text>}
      </span>
      <Flex align="center" justify="between" gap="3">
        <Text size="2" weight="bold">{item.name}</Text>
        <Badge color="gray" aria-label={`${item.quantity} collected`}>×{item.quantity}</Badge>
      </Flex>
    </button>
  </Card>;
}

function ToyCanvas({item, onClose}) {
  const canvasRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let preview;
    setStatus('loading');
    setError(null);
    loadPreview().then(async ({CapsuleToyPreview}) => {
      controller.signal.throwIfAborted();
      preview = new CapsuleToyPreview(canvasRef.current);
      await preview.show(item.key, controller.signal);
      controller.signal.throwIfAborted();
      preview.inspect({getBinding: action => generalPreferences.binding(action), onClose: () => onCloseRef.current()});
      setStatus('ready');
    }).catch(error => {
      if (controller.signal.aborted) return;
      preview?.dispose();
      setError(error.message);
      setStatus('error');
    });
    return () => { controller.abort(); preview?.dispose(); };
  }, [item.key, attempt]);
  return <div className="collection-toy-stage" data-status={status}>
    <canvas ref={canvasRef} aria-label={`3D preview of ${item.name}`} />
    {status !== 'ready' && <Flex className="collection-toy-status" direction="column" align="center" gap="3" role="status">
      <Text>{error || 'Loading toy…'}</Text>
      {status === 'error' && <Button variant="soft" onClick={() => setAttempt(value => value + 1)}>Retry preview</Button>}
    </Flex>}
  </div>;
}

export function CollectionPreviews({items}) {
  const [selected, setSelected] = useState(null);
  const [thumbnails, setThumbnails] = useState(null);
  const returnFocus = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    let disposed = false;
    const pool = loadPreview().then(({CapsuleToyThumbnails}) => {
      const value = new CapsuleToyThumbnails();
      if (disposed) value.dispose();
      return value;
    });
    // Observe import failures even if the collection closes before cards mount.
    pool.catch(() => {});
    setThumbnails(pool);
    return () => { disposed = true; void pool.then(value => value.dispose()).catch(() => {}); };
  }, []);
  return <>
    {thumbnails && items.map(item => <CollectionToyCard key={item.key} item={item} thumbnails={thumbnails}
      onSelect={item => { returnFocus.current = document.activeElement; setSelected(item); }} />)}
    <Dialog.Root open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      <Dialog.Content maxWidth="560px" aria-describedby="collection-toy-help"
        onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}>
        <Flex align="center" justify="between" gap="3">
          <Dialog.Title mb="0">{selected?.name}</Dialog.Title>
          <Dialog.Close>
            <IconButton ref={closeRef} variant="soft" color="gray" aria-label="Close toy preview">
              {formatControlBinding(generalPreferences.binding('cancel'))}
            </IconButton>
          </Dialog.Close>
        </Flex>
        {selected && <ToyCanvas key={selected.key} item={selected} onClose={() => setSelected(null)} />}
        <Dialog.Description id="collection-toy-help" mb="0" size="2" align="center">
          <Kbd>A</Kbd> / <Kbd>D</Kbd> to rotate · Left or right drag to turn freely
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Root>
  </>;
}
