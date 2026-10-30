import {useEffect, useState} from 'react';
import {ArrowUpRightIcon, RocketLaunchIcon} from '@phosphor-icons/react';
import {getLaunchCountdown} from './launch-date';

export function LaunchCountdown() {
  const [remaining, setRemaining] = useState(() => getLaunchCountdown(Date.now()));
  useEffect(() => {
    const update = () => setRemaining(getLaunchCountdown(Date.now()));
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <section className="lp-launch lp-container" aria-labelledby="lp-launch-title">
    <div className="lp-launch-panel lp-reveal">
      <div className="lp-launch-copy">
        <span className="lp-eyebrow"><RocketLaunchIcon size={16}/>UM NOVO COMEÇO</span>
        <h2 id="lp-launch-title">{remaining.reached ? 'Chegou o dia do lançamento.' : 'Nosso próximo passo tem data.'}</h2>
        <p>O lançamento do Forma está marcado para <time dateTime="2027-01-25">25 de janeiro de 2027</time>.</p>
        <a href="#landing/produto">Conheça o que estamos preparando<ArrowUpRightIcon size={15}/></a>
      </div>
      <div className="lp-launch-clock">
        <div className="lp-launch-digits" role="timer" aria-label="Tempo restante para o lançamento" aria-live="off">
          {([[remaining.days, 'Dias'], [remaining.hours, 'Horas'], [remaining.minutes, 'Minutos'], [remaining.seconds, 'Segundos']] as const).map(([value, label]) =>
            <div className="lp-launch-unit" key={label}><strong>{String(value).padStart(2, '0')}</strong><span>{label}</span></div>
          )}
        </div>
        <small>25 JAN 2027 · 00h · Horário de Brasília</small>
      </div>
    </div>
  </section>;
}
